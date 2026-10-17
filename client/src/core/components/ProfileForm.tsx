// Dane konta (PUT /api/auth/me): imię, nazwisko i kraj obowiązkowe (decyzja 2026-10-11), adres opcjonalny,
// jedna lokalizacja konta na mapie. Formularz rejestracji (pierwsze logowanie, App.tsx) i karta „Moje dane”
// (pages/Account). Pola .field z makiety (components/account.css), przyciski w .actions, zapis skrajnie z prawej.
import { FormEvent, useState } from 'react';
import { AuthRequests } from '../api';
import { ApiError } from '../http';
import { User } from '../types';
import { LocationPicker } from './LocationPicker';

const COUNTRIES = ['Polska', 'Niemcy', 'Czechy', 'Słowacja', 'Litwa', 'Ukraina', 'Wielka Brytania', 'Inny'];

type Props = {
  user: User;
  onSaved: (user: User) => void;
  /** bez onCancel (rejestracja) jest tylko „Zapisz” */
  onCancel?: () => void;
};

export function ProfileForm({ user, onSaved, onCancel }: Props) {
  const [form, setForm] = useState({
    firstName: user.firstName, lastName: user.lastName, street: user.street, postalCode: user.postalCode, city: user.city,
    country: user.country || 'Polska',
  });
  const [location, setLocation] = useState(user.location);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [name]: event.target.value })),
  });
  const countries = COUNTRIES.includes(form.country) ? COUNTRIES : [form.country, ...COUNTRIES];

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await AuthRequests.updateMe({ ...form, location }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Nie udało się zapisać danych.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="auth-step profile-form" onSubmit={save}>
      <div className="account-grid-2">
        <label className="field"><span>Imię *</span><input required maxLength={80} autoComplete="given-name" {...field('firstName')} /></label>
        <label className="field"><span>Nazwisko *</span><input required maxLength={80} autoComplete="family-name" {...field('lastName')} /></label>
      </div>
      <label className="field"><span>Ulica i numer</span><input maxLength={120} autoComplete="street-address" {...field('street')} /></label>
      <div className="account-grid-code">
        <label className="field"><span>Kod</span><input maxLength={20} autoComplete="postal-code" {...field('postalCode')} /></label>
        <label className="field"><span>Miejscowość</span><input maxLength={120} autoComplete="address-level2" {...field('city')} /></label>
      </div>
      <label className="field">
        <span>Kraj *</span>
        <select required {...field('country')}>
          {countries.map((country) => <option key={country}>{country}</option>)}
        </select>
      </label>
      <div className="field">
        <span>Lokalizacja — kliknij na mapie</span>
        <LocationPicker value={location} onChange={setLocation} />
      </div>
      {error && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}
      <div className="actions actions-gap">
        {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={saving}>Anuluj</button>}
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
      </div>
    </form>
  );
}
