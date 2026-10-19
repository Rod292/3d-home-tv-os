import { IconClose, IconSearch } from "./icons";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}

export function SearchField({ value, onChange, placeholder, label }: Props) {
  return (
    <div className="search">
      <IconSearch className="search-icon" width={16} height={16} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange("")} aria-label="Effacer la recherche">
          <IconClose width={14} height={14} />
        </button>
      )}
    </div>
  );
}
