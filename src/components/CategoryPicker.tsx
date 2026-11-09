import type { Category } from '../../shared/schema';

interface Props {
  name: string;
  legend: string;
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}

/** Native radio inputs styled as chips: arrow-key navigation and screen-reader semantics for free. */
export function CategoryPicker({ name, legend, categories, value, onChange, error }: Props) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="field__label" style={{ marginBottom: 6 }}>
        {legend}
      </legend>
      <div className="chips">
        {categories.map((c) => (
          <label key={c.id} className="chip">
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
            />
            <span className="dot" style={{ '--dot': c.color } as React.CSSProperties} />
            {c.name}
          </label>
        ))}
      </div>
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}
