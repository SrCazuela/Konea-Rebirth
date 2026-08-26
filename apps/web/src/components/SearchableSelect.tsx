import { useId, useMemo, useState } from 'react'

type SearchableSelectProps = {
  label: string
  value: string | null
  options: readonly string[]
  placeholder: string
  disabled?: boolean
  required?: boolean
  onChange: (value: string | null) => void
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')

export function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  disabled = false,
  required = false,
  onChange,
}: SearchableSelectProps) {
  const id = useId()
  const [query, setQuery] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = useMemo(() => {
    const search = normalize(query.trim())
    if (!search) return options.slice(0, 12)
    return options
      .filter((option) => normalize(option).includes(search))
      .slice(0, 12)
  }, [options, query])

  const select = (option: string) => {
    setQuery(option)
    onChange(option)
    setOpen(false)
  }

  const finishEditing = () => {
    const exact = options.find(
      (option) => normalize(option) === normalize(query.trim()),
    )
    if (exact) select(exact)
    else setQuery(value ?? '')
    setOpen(false)
  }

  return (
    <div className="portal-search-select">
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className="portal-search-select__control">
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && filtered[activeIndex]
              ? `${id}-option-${activeIndex}`
              : undefined
          }
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(finishEditing, 120)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActiveIndex(0)
            if (!event.target.value) onChange(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((current) =>
                Math.min(current + 1, Math.max(0, filtered.length - 1)),
              )
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((current) => Math.max(0, current - 1))
            } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
              event.preventDefault()
              select(filtered[activeIndex])
            } else if (event.key === 'Escape') {
              setQuery(value ?? '')
              setOpen(false)
            }
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label={`Limpiar ${label.toLowerCase()}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery('')
              onChange(null)
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && !disabled && (
        <div
          className="portal-search-select__options"
          id={`${id}-options`}
          role="listbox"
        >
          {filtered.length ? (
            filtered.map((option, index) => (
              <button
                id={`${id}-option-${index}`}
                className={index === activeIndex ? 'is-active' : ''}
                type="button"
                role="option"
                aria-selected={option === value}
                key={option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
              >
                {option}
              </button>
            ))
          ) : (
            <p>No hay opciones que coincidan.</p>
          )}
        </div>
      )}
      <small>Escribe para buscar y selecciona una opción.</small>
    </div>
  )
}
