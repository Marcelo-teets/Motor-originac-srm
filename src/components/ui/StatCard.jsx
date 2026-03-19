import Card from './Card';

export default function StatCard({ title, value, trend, tone = 'default' }) {
  return (
    <Card className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__title">{title}</span>
      <strong className="stat-card__value">{value}</strong>
      {trend && <span className="stat-card__trend">{trend}</span>}
    </Card>
  );
}
