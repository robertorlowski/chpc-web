// Nagłówek karty „Sterownik” w Ustawieniach wszystkich rodzajów (makieta: <header class="card-head"><h2>Sterownik</h2>
// + ikona edycji>): ikona otwiera popup „Dane sterownika” (DeviceEditModal). Do wstawienia jako pierwsze dziecko
// <section class="card">; całą kartę z wierszami .kv buduje ControllerCard.
import { IconButton } from './IconButton';
import { EditIcon } from './icons';
import { useLang } from '../i18n';
import './controllerCardTitle.css';

export const ControllerCardTitle: React.FC<{ onEdit: () => void; disabled?: boolean; title?: string }> = ({ onEdit, disabled, title }) => {
  const { t } = useLang();
  return (
    <header className="card-head controller-card-head">
      <h2>{title ?? t('nav.device')}</h2>
      <IconButton label={t('controller.edit')} icon={<EditIcon />} disabled={disabled} onClick={onEdit} />
    </header>
  );
};
