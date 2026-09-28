// Krótki komunikat po zapisie (np. „Polecenie wysłane do sterownika.”). Nie ukrywa się sam:
// wywołujący czyści message po kilku sekundach (setTimeout w Ustawieniach i Harmonogramach).
import './notification.css';

type NotificationProps = {
  message: string;
};

export default function Notification({ message }: NotificationProps) {
  if (!message) return null;
  return <span className="notification" role="status">{message}</span>;
}
