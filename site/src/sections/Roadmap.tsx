import { Lift, RiseTitle } from "../components/Reveal";
import { ISSUES } from "../links";
import { ROADMAP, STATUS } from "../roadmap";

/** Where the project stands today, and what comes next. */
export function Roadmap() {
  return (
    <section className="roadmap" id="roadmap" aria-labelledby="roadmap-title">
      <div className="roadmap-head">
        <RiseTitle text="Where Kenning is." className="section-heading" />
        <ul className="status" aria-label="Status">
          {STATUS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="roadmap-cols">
        {ROADMAP.map((col, i) => (
          <Lift key={col.title} delay={i * 0.08} className={`roadmap-col ${col.title.toLowerCase()}`}>
            <h3>{col.title}</h3>
            <ul>
              {col.items.map((it) => (
                <li key={it.text}>
                  {it.href ? <a href={it.href}>{it.text}</a> : it.text}
                  {it.funded && <span className="funded">Funded by {it.funded}</span>}
                </li>
              ))}
            </ul>
          </Lift>
        ))}
      </div>

      <p className="roadmap-fine">
        Something missing or wrong? <a href={ISSUES}>Open an issue</a>.
      </p>
    </section>
  );
}
