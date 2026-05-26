/**
 * AutotaskPicker — company and contact pickers backed by the Autotask CRM proxy.
 *
 * Both components fall back gracefully to plain text inputs when:
 *  • The CRM is not configured in settings
 *  • The API call fails
 *  • The user prefers to type freely
 */
import { useState, useEffect, useRef } from 'react';
import { Search, Building2, User, Loader2, Link2, X } from 'lucide-react';
import { crmApi, type CrmCompany, type CrmContact } from '../../lib/api';
import clsx from 'clsx';

const INPUT_CLS =
  'w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 ' +
  'rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ' +
  'disabled:bg-gray-50 dark:disabled:bg-slate-800 disabled:text-gray-400';

// ─── Company picker ───────────────────────────────────────────────────────────

interface CompanyPickerProps {
  value:     string;
  crmId?:    string;
  onChange:  (name: string, crmId?: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AutotaskCompanyPicker({ value, crmId, onChange, disabled, placeholder = 'Search Autotask or type client name…' }: CompanyPickerProps) {
  const [configured, setConfigured] = useState(false);
  const [query,      setQuery]      = useState(value);
  const [results,    setResults]    = useState<CrmCompany[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [open,       setOpen]       = useState(false);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if CRM is configured on mount
  useEffect(() => {
    crmApi.status().then(r => setConfigured(r.configured)).catch(() => {});
  }, []);

  // Sync external value changes (e.g. cleared from outside)
  useEffect(() => { setQuery(value); }, [value]);

  // Debounced search
  useEffect(() => {
    if (!configured || query.length < 2) { setResults([]); setLoading(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      crmApi.searchCompanies(query)
        .then(r => { setResults(r); setLoading(false); })
        .catch(() => { setResults([]); setLoading(false); });
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, configured]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (company: CrmCompany) => {
    onChange(company.companyName, String(company.id));
    setQuery(company.companyName);
    setResults([]);
    setOpen(false);
  };

  const handleChange = (val: string) => {
    setQuery(val);
    setOpen(true);
    // If user edits the text away from the selected CRM company, clear the CRM ID
    if (crmId && val !== value) onChange(val, undefined);
    else onChange(val, crmId);
  };

  const clearCrm = () => { onChange('', undefined); setQuery(''); };

  if (!configured) {
    // CRM not set up — just a plain text input
    return (
      <input
        className={INPUT_CLS}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Client name"
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          className={clsx(INPUT_CLS, 'pl-8', crmId ? 'pr-20' : 'pr-8')}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
        )}
        {crmId && !loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-xs text-brand-500 flex items-center gap-0.5 font-medium">
              <Link2 size={10} /> CRM
            </span>
            {!disabled && (
              <button type="button" onClick={clearCrm} className="text-gray-400 hover:text-red-500 ml-0.5">
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(company => (
            <button
              key={company.id}
              type="button"
              onMouseDown={() => handleSelect(company)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-900/20 text-left transition-colors"
            >
              <Building2 size={14} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                  {company.companyName}
                </div>
                {company.city && (
                  <div className="text-xs text-gray-400 dark:text-slate-500">{company.city}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Contact picker ───────────────────────────────────────────────────────────

interface ContactPickerProps {
  value:         string;
  crmCompanyId?: string;
  /** Called with (name, email?) whenever the selected contact changes */
  onChange:      (name: string, email?: string) => void;
  disabled?:     boolean;
}

export function AutotaskContactPicker({ value, crmCompanyId, onChange, disabled }: ContactPickerProps) {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [manual,   setManual]   = useState(false);  // user chose to type manually

  // Load contacts whenever the CRM company changes
  useEffect(() => {
    if (!crmCompanyId) { setContacts([]); setManual(false); return; }
    setLoading(true);
    crmApi.getContacts(parseInt(crmCompanyId))
      .then(c => { setContacts(c); setManual(c.length === 0); })
      .catch(() => { setContacts([]); setManual(true); })
      .finally(() => setLoading(false));
  }, [crmCompanyId]);

  const handleSelect = (contactId: string) => {
    if (!contactId) { onChange('', undefined); return; }
    const contact = contacts.find(c => String(c.id) === contactId);
    if (!contact) { onChange('', undefined); return; }
    const name = `${contact.firstName} ${contact.lastName}`.trim();
    onChange(name, contact.emailAddress ?? undefined);
  };

  // No CRM company linked — plain text
  if (!crmCompanyId || manual) {
    return (
      <div>
        <input
          className={INPUT_CLS}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Contact name"
        />
        {crmCompanyId && manual && contacts.length === 0 && !loading && (
          <p className="text-xs text-gray-400 mt-1">No contacts found in Autotask for this company.</p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={clsx(INPUT_CLS, 'flex items-center gap-2 text-gray-400')}>
        <Loader2 size={13} className="animate-spin flex-shrink-0" />
        <span className="text-sm">Loading contacts…</span>
      </div>
    );
  }

  // Find the currently-selected contact ID from the name value
  const selectedContact = contacts.find(c => `${c.firstName} ${c.lastName}`.trim() === value);
  const selectedId = selectedContact ? String(selectedContact.id) : '';

  return (
    <div>
      <div className="relative">
        <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <select
          className={clsx(INPUT_CLS, 'pl-8 dark:bg-slate-700')}
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
          disabled={disabled}
        >
          <option value="">— Select contact —</option>
          {contacts.map(c => {
            const name = `${c.firstName} ${c.lastName}`.trim();
            const label = c.title ? `${name} (${c.title})` : name;
            return <option key={c.id} value={String(c.id)}>{label}</option>;
          })}
        </select>
      </div>
      {/* Show email of selected contact as a hint */}
      {selectedContact?.emailAddress && (
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 flex items-center gap-1">
          <span className="opacity-60">✉</span> {selectedContact.emailAddress}
        </p>
      )}
      <button
        type="button"
        onClick={() => setManual(true)}
        className="mt-1 text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 underline"
      >
        Type name manually
      </button>
    </div>
  );
}
