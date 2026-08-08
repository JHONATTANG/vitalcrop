export interface IoTDevice {
  id: string;
  device_uid: string;
  device_type: string;
  status: 'ONLINE' | 'OFFLINE';
  last_seen?: string;
}
