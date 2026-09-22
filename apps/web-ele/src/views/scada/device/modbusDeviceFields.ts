export interface ModbusDeviceForm {
  port: number;
  protocol: string;
  closeTcpSocketOnTimeout: boolean;
  zeroBasedAddressing: boolean;
  zeroBasedBitAddressingRegisters: boolean;
  holdingRegisterBitMaskWrites: boolean;
  modbusFunction06: boolean;
  modbusFunction05: boolean;
  clientPrivileges: string;
  defaultModbusByteOrder: boolean;
  firstWordLow32: boolean;
  firstDwordLow64: boolean;
  modiconBitOrdering: boolean;
  longsAsDouble: boolean;
  cegExtension: boolean;
  blockOutput: number;
  blockInput: number;
  blockInternal: number;
  blockHolding: number;
  performBlockStringRead: boolean;
  variableImportFile: string;
  displayDescriptions: boolean;
  timeoutSec: number;
  dataBadUntilWrite: boolean;
  deactivateOnIllegalAddress: boolean;
}

export function defaultModbusDeviceForm(): ModbusDeviceForm {
  return {
    port: 502,
    protocol: 'tcp',
    closeTcpSocketOnTimeout: true,
    zeroBasedAddressing: true,
    zeroBasedBitAddressingRegisters: true,
    holdingRegisterBitMaskWrites: true,
    modbusFunction06: true,
    modbusFunction05: true,
    clientPrivileges: 'read_only',
    defaultModbusByteOrder: true,
    firstWordLow32: true,
    firstDwordLow64: true,
    modiconBitOrdering: false,
    longsAsDouble: false,
    cegExtension: true,
    blockOutput: 32,
    blockInput: 32,
    blockInternal: 32,
    blockHolding: 32,
    performBlockStringRead: false,
    variableImportFile: '*.txt',
    displayDescriptions: true,
    timeoutSec: 0,
    dataBadUntilWrite: false,
    deactivateOnIllegalAddress: true,
  };
}

function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function hydrateModbusDeviceForm(
  settings: Record<string, any> | undefined,
): ModbusDeviceForm {
  const base = defaultModbusDeviceForm();
  const s = settings || {};
  const comm = (s.communications || {}) as Record<string, any>;
  const blocks = (s.block_sizes || {}) as Record<string, any>;
  return {
    ...base,
    port: asNum(comm.port, base.port),
    protocol:
      typeof comm.protocol === 'string' && comm.protocol
        ? comm.protocol
        : base.protocol,
    closeTcpSocketOnTimeout: asBool(
      comm.close_tcp_socket_on_timeout,
      base.closeTcpSocketOnTimeout,
    ),
    zeroBasedAddressing: asBool(
      s.zero_based_addressing,
      base.zeroBasedAddressing,
    ),
    zeroBasedBitAddressingRegisters: asBool(
      s.zero_based_bit_addressing_registers,
      base.zeroBasedBitAddressingRegisters,
    ),
    holdingRegisterBitMaskWrites: asBool(
      s.holding_register_bit_mask_writes,
      base.holdingRegisterBitMaskWrites,
    ),
    modbusFunction06: asBool(
      s.modbus_function_06_single_register_writes,
      base.modbusFunction06,
    ),
    modbusFunction05: asBool(
      s.modbus_function_05_single_coil_writes,
      base.modbusFunction05,
    ),
    clientPrivileges:
      typeof s.client_privileges === 'string' && s.client_privileges
        ? s.client_privileges
        : base.clientPrivileges,
    defaultModbusByteOrder: asBool(
      s.default_modbus_byte_order,
      base.defaultModbusByteOrder,
    ),
    firstWordLow32: asBool(s.first_word_low_32bit, base.firstWordLow32),
    firstDwordLow64: asBool(s.first_dword_low_64bit, base.firstDwordLow64),
    modiconBitOrdering: asBool(s.modicon_bit_ordering, base.modiconBitOrdering),
    longsAsDouble: asBool(
      s.longs_as_double_precision_unsigned,
      base.longsAsDouble,
    ),
    cegExtension: asBool(s.ceg_extension, base.cegExtension),
    blockOutput: asNum(blocks.output, base.blockOutput),
    blockInput: asNum(blocks.input, base.blockInput),
    blockInternal: asNum(blocks.internal, base.blockInternal),
    blockHolding: asNum(blocks.holding, base.blockHolding),
    performBlockStringRead: asBool(
      blocks.perform_block_string_read,
      base.performBlockStringRead,
    ),
    variableImportFile:
      typeof s.variable_import_file === 'string' && s.variable_import_file
        ? s.variable_import_file
        : base.variableImportFile,
    displayDescriptions: asBool(
      s.display_descriptions,
      base.displayDescriptions,
    ),
    timeoutSec: asNum(s.timeout_sec, base.timeoutSec),
    dataBadUntilWrite: asBool(s.data_bad_until_write, base.dataBadUntilWrite),
    deactivateOnIllegalAddress: asBool(
      s.deactivate_on_illegal_address,
      base.deactivateOnIllegalAddress,
    ),
  };
}

export function modbusSettingsPayload(form: ModbusDeviceForm) {
  return {
    communications: {
      port: form.port,
      protocol: form.protocol,
      close_tcp_socket_on_timeout: form.closeTcpSocketOnTimeout,
    },
    zero_based_addressing: form.zeroBasedAddressing,
    zero_based_bit_addressing_registers: form.zeroBasedBitAddressingRegisters,
    holding_register_bit_mask_writes: form.holdingRegisterBitMaskWrites,
    modbus_function_06_single_register_writes: form.modbusFunction06,
    modbus_function_05_single_coil_writes: form.modbusFunction05,
    client_privileges: form.clientPrivileges,
    default_modbus_byte_order: form.defaultModbusByteOrder,
    first_word_low_32bit: form.firstWordLow32,
    first_dword_low_64bit: form.firstDwordLow64,
    modicon_bit_ordering: form.modiconBitOrdering,
    longs_as_double_precision_unsigned: form.longsAsDouble,
    ceg_extension: form.cegExtension,
    block_sizes: {
      output: form.blockOutput,
      input: form.blockInput,
      internal: form.blockInternal,
      holding: form.blockHolding,
      perform_block_string_read: form.performBlockStringRead,
    },
    variable_import_file: form.variableImportFile,
    display_descriptions: form.displayDescriptions,
    timeout_sec: form.timeoutSec,
    data_bad_until_write: form.dataBadUntilWrite,
    deactivate_on_illegal_address: form.deactivateOnIllegalAddress,
  };
}
