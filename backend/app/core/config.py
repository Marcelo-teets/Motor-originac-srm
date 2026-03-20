from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Origination Intelligence Platform V7"
    database_url: str = "sqlite:///./origination_v7.db"


settings = Settings()
