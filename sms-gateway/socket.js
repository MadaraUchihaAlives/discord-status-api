'use strict';

const db = require('./db');

function setupSocket(io) {
  io.on('connection', (socket) => {
    socket.on('join_dashboard', (data) => {
      if (data?.user_id) socket.join(`user:${data.user_id}`);
    });

    socket.on('device_heartbeat', async (data) => {
      const { device_id, user_id, battery, charging, network_type, carrier, ram_usage, storage_usage, cpu_usage, ip_address } = data || {};
      if (!device_id) return;

      await db.mutate(async (store) => {
        const device = store.devices.find((d) => d.id === device_id);
        if (!device) return;
        if (user_id && device.user_id !== user_id) return;
        device.battery = battery ?? device.battery;
        device.charging = charging ? 1 : 0;
        device.network_type = network_type ?? device.network_type;
        device.carrier = carrier ?? device.carrier;
        device.ram_usage = ram_usage ?? device.ram_usage;
        device.storage_usage = storage_usage ?? device.storage_usage;
        device.cpu_usage = cpu_usage ?? device.cpu_usage;
        device.ip_address = ip_address ?? device.ip_address;
        device.status = 'online';
        device.socket_id = socket.id;
        device.last_seen = db.now();
        device.updated_at = db.now();
        io.to(`user:${device.user_id}`).emit('device_updated', { device_id: device.id, user_id: device.user_id, device });
      });
    });

    socket.on('disconnect', async () => {
      await db.mutate(async (store) => {
        const device = store.devices.find((d) => d.socket_id === socket.id);
        if (device) {
          device.status = 'offline';
          device.socket_id = null;
          device.updated_at = db.now();
          io.to(`user:${device.user_id}`).emit('device_disconnected', { device_id: device.id, user_id: device.user_id });
        }
      });
    });
  });
}

module.exports = setupSocket;
