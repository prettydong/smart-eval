import api from './solver';

// ─── 产品配置类型 ───

export interface ProductConfig {
    name: string;
    mode: 'lcr' | 'ccr';
    maxrow: number;
    maxcol: number;
    rowcap: number;
    sectioncnt: number;
    colseg: number;
    sectionGroupSize: number;
    subsectionSize: number;
    subsectionsPerGroup: number;
    cpsPerRegion: number;
    lcrCap: number;
    ccrGroupsPerSection: number;
    ccrCap: number;
}

// ─── API 方法 ───

export async function listConfigs(): Promise<ProductConfig[]> {
    const { data } = await api.get<ProductConfig[]>('/configs');
    return data;
}

export async function getConfig(name: string): Promise<ProductConfig> {
    const { data } = await api.get<ProductConfig>(`/configs/${encodeURIComponent(name)}`);
    return data;
}

export async function saveConfig(config: ProductConfig): Promise<void> {
    await api.put('/configs', config);
}

export async function deleteConfig(name: string): Promise<void> {
    await api.delete(`/configs/${encodeURIComponent(name)}`);
}
