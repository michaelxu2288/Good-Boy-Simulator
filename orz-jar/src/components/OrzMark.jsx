// the signature mark: the literal "orz" emoticon (o = head, r = hunched arms,
// z = folded legs) rendered in a marker hand, in the culprit's color. this IS
// the token everywhere -- jar, cards, login.
export default function OrzMark({ color = 'var(--ink)', size = 28, title }) {
  return (
    <span
      className="orz-mark"
      style={{ color, fontSize: `${size}px` }}
      title={title}
      aria-label="orz"
    >
      orz
    </span>
  )
}
