import { formatPrimitive, toDisplayLabel } from '../lib/api.js';

export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function createSurfaceCard({ title, subtitle, asideText, body }) {
  const card = createElement('section', 'surface-card');
  const header = createElement('header', 'surface-card__header');
  const content = createElement('div');
  const eyebrow = createElement('p', 'surface-card__eyebrow', 'Origination Intelligence');
  const heading = createElement('h2', null, title);
  content.append(eyebrow, heading);

  if (subtitle) {
    content.append(createElement('p', 'surface-card__subtitle', subtitle));
  }

  header.append(content);

  if (asideText) {
    const aside = createElement('div', 'surface-card__aside');
    aside.append(createElement('div', 'metric-pill', asideText));
    header.append(aside);
  }

  const cardBody = createElement('div', 'surface-card__body');
  cardBody.append(body);
  card.append(header, cardBody);
  return card;
}

export function createStatusBlock(message, isError = false) {
  return createElement('div', `status-block${isError ? ' status-block--error' : ''}`, message);
}

export function createDefinitionGrid(items, columns = 3) {
  const grid = createElement('dl', 'definition-grid');
  grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;

  items.forEach(({ label, value }) => {
    const wrapper = createElement('div', 'definition-grid__item');
    wrapper.append(createElement('dt', null, label), createElement('dd', null, formatPrimitive(value)));
    grid.append(wrapper);
  });

  return grid;
}

export function createSectionList(title, items, emptyMessage) {
  const container = createElement('div', 'section-list');
  const header = createElement('div', 'section-list__header');
  header.append(createElement('h3', null, title), createElement('span', null, String(items.length)));
  container.append(header);

  if (!items.length) {
    container.append(createElement('p', 'section-list__empty', emptyMessage));
    return container;
  }

  const list = createElement('ul');
  items.forEach((item) => {
    const listItem = createElement('li');
    listItem.textContent = formatPrimitive(item);
    list.append(listItem);
  });
  container.append(list);
  return container;
}

export function createSummaryMetric(label, value) {
  const wrapper = createElement('div');
  wrapper.append(createElement('span', null, label), createElement('strong', null, formatPrimitive(value)));
  return wrapper;
}

export function createKeyValueList(data) {
  const wrapper = createElement('div', 'key-value-table key-value-table--2');
  Object.entries(data).forEach(([key, value]) => {
    const row = createElement('div', 'key-value-table__row');
    row.append(createElement('span', null, toDisplayLabel(key)), createElement('strong', null, formatPrimitive(value)));
    wrapper.append(row);
  });
  return wrapper;
}
