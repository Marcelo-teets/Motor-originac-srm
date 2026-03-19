export function StateBlock({ title, message, tone = 'neutral' }) {
  return (
    <div className={`state-block ${tone}`}>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  )
}
