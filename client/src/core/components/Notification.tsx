import './notification.css';

type NotificationProps = {
  message: string;
};

export default function Notification({ message }: NotificationProps) {
  if (!message) return null;
  return <span className="notification" role="status">{message}</span>;
}
