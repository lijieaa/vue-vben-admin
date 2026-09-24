export interface S7DeviceForm {
  port: number;
  linkType: string;
  rack: number;
  slot: number;
  localTsap: number;
  remoteTsap: number;
  mpiId: number;
  littleEndian: boolean;
  tagImportType: string;
  importFile: string;
  projectFile: string;
  programPath: string;
  codePage: number;
}

export function defaultS7DeviceForm(model = 's7_300'): S7DeviceForm {
  const netlink = model.startsWith('netlink_');
  const s7200 = model === 's7_200';
  const slot = model === 's7_1200' || model === 's7_1500' ? 1 : 2;
  return {
    port: netlink ? 1099 : 102,
    linkType: s7200 || netlink ? '' : 'PC',
    rack: 0,
    slot: s7200 || netlink ? 0 : slot,
    localTsap: s7200 ? 19_799 : 0,
    remoteTsap: s7200 ? 19_799 : 0,
    mpiId: 0,
    littleEndian: false,
    tagImportType: 'csv',
    importFile: '',
    projectFile: '',
    programPath: '',
    codePage: 0,
  };
}

function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function hydrateS7DeviceForm(
  settings: Record<string, any> | undefined,
  model?: string,
): S7DeviceForm {
  const base = defaultS7DeviceForm(model);
  const s = settings || {};
  const comm = (s.communications || {}) as Record<string, any>;
  const addr = (s.addressing_options || {}) as Record<string, any>;
  const atg = (s.auto_tag_generation || {}) as Record<string, any>;
  return {
    ...base,
    port: asNum(comm.port, base.port),
    linkType:
      typeof comm.link_type === 'string' ? comm.link_type : base.linkType,
    rack: asNum(comm.rack, base.rack),
    slot: asNum(comm.slot, base.slot),
    localTsap: asNum(comm.local_tsap, base.localTsap),
    remoteTsap: asNum(comm.remote_tsap, base.remoteTsap),
    mpiId: asNum(comm.mpi_id, base.mpiId),
    littleEndian: asBool(addr.use_little_endian_byte_order, base.littleEndian),
    tagImportType:
      typeof atg.tag_import_type === 'string' && atg.tag_import_type
        ? atg.tag_import_type
        : base.tagImportType,
    importFile:
      typeof atg.import_file === 'string' ? atg.import_file : base.importFile,
    projectFile:
      typeof atg.project_file === 'string'
        ? atg.project_file
        : base.projectFile,
    programPath:
      typeof atg.program_path === 'string'
        ? atg.program_path
        : base.programPath,
    codePage: asNum(atg.code_page, base.codePage),
  };
}

export function s7SettingsPayload(form: S7DeviceForm) {
  return {
    communications: {
      port: form.port,
      link_type: form.linkType || undefined,
      rack: form.rack,
      slot: form.slot,
      local_tsap: form.localTsap,
      remote_tsap: form.remoteTsap,
      mpi_id: form.mpiId,
    },
    addressing_options: {
      use_little_endian_byte_order: form.littleEndian,
    },
    auto_tag_generation: {
      tag_import_type: form.tagImportType,
      import_file: form.importFile,
      project_file: form.projectFile,
      program_path: form.programPath,
      code_page: form.codePage,
    },
  };
}

export function s7ShowsTSAP(model: string): boolean {
  return model === 's7_200';
}

export function s7ShowsRackSlot(model: string): boolean {
  return (
    model === 's7_300' ||
    model === 's7_400' ||
    model === 's7_1200' ||
    model === 's7_1500'
  );
}

export function s7ShowsMPI(model: string): boolean {
  return model.startsWith('netlink_');
}

export function s7ShowsATGProject(model: string): boolean {
  return model === 's7_300' || model === 's7_400';
}
