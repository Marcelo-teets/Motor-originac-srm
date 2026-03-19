from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, Union, get_args, get_origin


@dataclass(slots=True)
class FieldInfo:
    default: Any = ...
    default_factory: Callable[[], Any] | None = None
    min_length: int | None = None
    max_length: int | None = None
    ge: int | float | None = None
    le: int | float | None = None


def Field(default: Any = ..., **kwargs: Any) -> FieldInfo:
    return FieldInfo(default=default, **kwargs)


def field_validator(*fields: str):
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        func.__field_validator_fields__ = fields
        return func
    return decorator


class BaseModel:
    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        validators: Dict[str, list[Callable[..., Any]]] = {}
        for value in cls.__dict__.values():
            fields = getattr(value, "__field_validator_fields__", None)
            target = value
            if isinstance(value, classmethod):
                fields = getattr(value, "__field_validator_fields__", None) or getattr(value.__func__, "__field_validator_fields__", None)
                target = value.__func__
            if fields:
                for field in fields:
                    validators.setdefault(field, []).append(target)
        cls.__field_validators__ = validators

    def __init__(self, **data: Any) -> None:
        annotations = getattr(self.__class__, "__annotations__", {})
        for name, annotation in annotations.items():
            class_value = getattr(self.__class__, name, ...)
            field_info = class_value if isinstance(class_value, FieldInfo) else None
            if name in data:
                value = data[name]
            elif field_info and field_info.default_factory is not None:
                value = field_info.default_factory()
            elif field_info and field_info.default is not ...:
                value = field_info.default
            elif class_value is not ... and not isinstance(class_value, FieldInfo):
                value = class_value
            else:
                raise TypeError(f"Missing required field: {name}")

            value = self._coerce_type(annotation, value)
            if field_info:
                self._apply_field_constraints(name, value, field_info)
            for validator in getattr(self.__class__, "__field_validators__", {}).get(name, []):
                value = validator(self.__class__, value)
            setattr(self, name, value)

    @classmethod
    def model_validate(cls, obj: Any, from_attributes: bool = False):
        if isinstance(obj, cls):
            return obj
        if from_attributes:
            data = {name: getattr(obj, name) for name in cls.__annotations__}
        else:
            data = obj
        return cls(**data)

    def model_dump(self) -> dict[str, Any]:
        return {name: self._serialize(getattr(self, name)) for name in self.__class__.__annotations__}

    @classmethod
    def _serialize(cls, value: Any) -> Any:
        if isinstance(value, BaseModel):
            return value.model_dump()
        if isinstance(value, Enum):
            return value.value
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, list):
            return [cls._serialize(item) for item in value]
        if isinstance(value, dict):
            return {key: cls._serialize(item) for key, item in value.items()}
        return value

    @classmethod
    def _apply_field_constraints(cls, name: str, value: Any, field_info: FieldInfo) -> None:
        if value is None:
            return
        if field_info.min_length is not None and len(value) < field_info.min_length:
            raise ValueError(f"Field {name} shorter than min_length")
        if field_info.max_length is not None and len(value) > field_info.max_length:
            raise ValueError(f"Field {name} longer than max_length")
        if field_info.ge is not None and value < field_info.ge:
            raise ValueError(f"Field {name} lower than ge")
        if field_info.le is not None and value > field_info.le:
            raise ValueError(f"Field {name} higher than le")

    @classmethod
    def _coerce_type(cls, annotation: Any, value: Any) -> Any:
        origin = get_origin(annotation)
        args = get_args(annotation)
        if annotation is Any:
            return value
        if origin in {list, tuple} and args:
            return [cls._coerce_type(args[0], item) for item in value]
        if origin is dict and len(args) == 2:
            return {key: cls._coerce_type(args[1], item) for key, item in value.items()}
        if origin is Union or str(origin) == "<class 'types.UnionType'>":
            non_none = [arg for arg in args if arg is not type(None)]
            if value is None:
                return None
            for arg in non_none:
                try:
                    return cls._coerce_type(arg, value)
                except Exception:
                    continue
            return value
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            if isinstance(value, annotation):
                return value
            return annotation(**value)
        if isinstance(annotation, type) and issubclass(annotation, Enum):
            return value if isinstance(value, annotation) else annotation(value)
        if annotation is datetime and isinstance(value, str):
            return datetime.fromisoformat(value)
        if annotation in {str, int, float, bool} and value is not None and not isinstance(value, annotation):
            return annotation(value)
        return value
