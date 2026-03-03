import { useState, useEffect, useCallback } from 'react';
import { listConfigs, saveConfig, deleteConfig, type ProductConfig } from '../api/config';

export const emptyConfig = (): ProductConfig => ({
    name: '', mode: 'lcr',
    maxrow: 16384, maxcol: 1024,
    rowcap: 128, sectioncnt: 48, colseg: 2,
    sectionGroupSize: 2048, subsectionSize: 344, subsectionsPerGroup: 6,
    cpsPerRegion: 2, lcrCap: 2,
    ccrGroupsPerSection: 8, ccrCap: 2,
});

export interface ArchState {
    configs: ProductConfig[];
    selected: string | null;
    isNew: boolean;
    form: ProductConfig;
    saving: boolean;
    msg: { text: string; ok: boolean } | null;
    reload: () => void;
    handleSelect: (name: string) => void;
    handleNew: () => void;
    handleSave: () => Promise<void>;
    handleDelete: () => Promise<void>;
    setForm: React.Dispatch<React.SetStateAction<ProductConfig>>;
}

export function useArchState(): ArchState {
    const [configs, setConfigs] = useState<ProductConfig[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [form, setForm] = useState<ProductConfig>(emptyConfig());
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const reload = useCallback(() => {
        listConfigs().then(setConfigs).catch(() => { });
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const handleSelect = useCallback((name: string) => {
        setConfigs(prev => {
            const cfg = prev.find(c => c.name === name);
            if (cfg) { setForm({ ...cfg }); setSelected(name); setIsNew(false); }
            return prev;
        });
    }, []);

    const handleNew = useCallback(() => {
        setForm(emptyConfig());
        setSelected(null);
        setIsNew(true);
    }, []);

    const handleSave = useCallback(async () => {
        if (!form.name.trim()) { setMsg({ text: 'Name is required', ok: false }); return; }
        setSaving(true);
        try {
            await saveConfig(form);
            const updated = await listConfigs();
            setConfigs(updated);
            setSelected(form.name);
            setIsNew(false);
            setMsg({ text: `Saved "${form.name}"`, ok: true });
        } catch {
            setMsg({ text: 'Save failed', ok: false });
        } finally {
            setSaving(false);
            setTimeout(() => setMsg(null), 2500);
        }
    }, [form]);

    const handleDelete = useCallback(async () => {
        if (!selected) return;
        if (!confirm(`Delete "${selected}"?`)) return;
        try {
            await deleteConfig(selected);
            const updated = await listConfigs();
            setConfigs(updated);
            setSelected(null);
            setForm(emptyConfig());
            setIsNew(false);
        } catch {
            setMsg({ text: 'Delete failed', ok: false });
            setTimeout(() => setMsg(null), 2500);
        }
    }, [selected]);

    return {
        configs, selected, isNew, form, saving, msg,
        reload, handleSelect, handleNew, handleSave, handleDelete, setForm,
    };
}
