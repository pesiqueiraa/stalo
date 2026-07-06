export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  message: string | null;
  action?: ToastAction | null;
}

export function Toast({ message, action }: ToastProps) {
  return (
    <div className={`toast${message ? " show" : ""}`}>
      <span>{message}</span>
      {message && action && (
        <button className="toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
