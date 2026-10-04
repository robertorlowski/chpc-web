// Nagłówek karty „Sterownik” w Ustawieniach wszystkich rodzajów: tytuł i ikona edycji po prawej,
// która otwiera popup „Dane sterownika” (DeviceEditModal; dawny przycisk „Zmień”). Wspólna linia pod
// spodem jak belka strony firmware.
import { IconButton } from './IconButton';
import { EditIcon } from './icons';
import './controllerCardTitle.css';

export const ControllerCardTitle: React.FC<{ onEdit: () => void; disabled?: boolean }> = ({ onEdit, disabled }) => (
  <div className="controller-card-bar">
    <h3 className="settings-section-title">Sterownik</h3>
    <IconButton label="Zmień dane sterownika" icon={<EditIcon />} disabled={disabled} onClick={onEdit} />
  </div>
);
