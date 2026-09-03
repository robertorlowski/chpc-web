
import { DeviceType } from '../middleware/type';
import { DeviceDocument, DeviceModel } from '../models/model';

export async function createDevice(
  deviceType: DeviceType,
  deviceId: string,
  name?: string
): Promise<DeviceDocument> {  
  
  const rootId = await getDeviceById(deviceType, deviceId);
  if (!rootId) {
    let deviceDocument: DeviceDocument | null = null;
    deviceDocument = await DeviceModel.create({
      deviceType: deviceType,
      deviceId: deviceId,
      name: name
    });
    return deviceDocument;
  
  } else {
    throw new Error('Device already exists.');
  }
}

export async function getDeviceById(
  deviceType: DeviceType = DeviceType.HP,
  deviceId: string = 'hp-1',
): Promise<String | null | unknown> {

  const deviceDocument = await DeviceModel.findOne<DeviceDocument>({
      deviceType: deviceType,
      deviceId: deviceId
  })
  .lean();
  
  if (!deviceDocument) {
    throw new Error('Device not found');
  }
  return deviceDocument._id.toString();
}

