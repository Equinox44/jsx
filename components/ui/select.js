// components/ui/select.js
export const Select = ({ value, onValueChange, children, className = "", ...props }) => (
  <select
    value={value}
    onChange={e => onValueChange(e.target.value)}
    className={`block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 ${className}`}
    {...props}
  >
    {children}
  </select>
);

export const SelectContent = ({ children, className = "", ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
);

export const SelectItem = ({ value, children, className = "", ...props }) => (
  <option value={value} className={className} {...props}>
    {children}
  </option>
);

export const SelectTrigger = ({ children, className = "", ...props }) => (
  <button className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>
    {children}
  </button>
);

export const SelectValue = ({ placeholder = "Select...", className = "", ...props }) => (
  <span className={`block truncate ${className}`} {...props}>
    {placeholder}
  </span>
);
