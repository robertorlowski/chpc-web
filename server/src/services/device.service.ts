
import { DeviceProperties, DeviceType } from '../middleware/type';
import { DeviceDocument, DeviceModel } from '../models/model';

export async function createDevice(
  deviceType: DeviceType,
  deviceId: string,
  name?: string
): Promise<DeviceDocument> {  
  const existing = await DeviceModel.findOne({ deviceType, deviceId });
  if (existing) throw new Error('Device already exists.');

  return DeviceModel.create({
    deviceType,
    deviceId,
    name: name || deviceId,
    schedules: [],
  });
}

// Used by controllers registering themselves on start: a controller that is
// already known gets its existing record back instead of an error.
export async function registerDevice(
  deviceType: DeviceType,
  deviceId: string,
  name?: string
): Promise<{ device: DeviceDocument; created: boolean }> {
  const existing = await DeviceModel.findOne({ deviceType, deviceId });
  if (existing) return { device: existing, created: false };

  const device = await DeviceModel.create({
    deviceType,
    deviceId,
    name: name ?? '',
    schedules: [],
  });
  return { device, created: true };
}

export async function updateDeviceName(rootId: string, name: string): Promise<DeviceDocument> {
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: { name } },
    { new: true, runValidators: true },
  ).select('deviceType deviceId name').lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device;
}

export async function listDevices(): Promise<DeviceDocument[]> {
  return DeviceModel.find()
    .select('deviceType deviceId name')
    .sort({ name: 1 })
    .lean<DeviceDocument[]>();
}

export async function getDeviceProperties(rootId: string): Promise<DeviceProperties> {
  const device = await DeviceModel.findById(rootId).select('properties').lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device.properties ?? {};
}

export async function updateDeviceProperties(rootId: string, properties: DeviceProperties): Promise<DeviceProperties> {
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: { properties } },
    { new: true, runValidators: true },
  ).select('properties').lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device.properties ?? {};
}


