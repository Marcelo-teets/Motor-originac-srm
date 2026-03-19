export default function StatusBadge({ status }) {
  const normalized = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`status-badge status-badge--${normalized}`}>{status}</span>;
}
