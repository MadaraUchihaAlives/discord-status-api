const http = require("http");

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3000";
let token = "";
let apiKey = "";
let deviceId = "";

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = data;
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  const email = `test_${Date.now()}@xd.test`;
  const password = "testpass123";

  console.log("1. Ping");
  let r = await request("GET", "/api/ping");
  if (r.status !== 200) throw new Error("Ping failed");
  console.log("   OK", r.json.service);

  console.log("2. Register");
  r = await request("POST", "/api/auth/register", {
    email,
    password,
    name: "Test User"
  });
  if (r.status !== 201) throw new Error("Register failed: " + JSON.stringify(r.json));
  token = r.json.token;
  console.log("   OK user", r.json.user.email);

  console.log("3. Dashboard");
  r = await request("GET", "/api/dashboard", null, {
    Authorization: `Bearer ${token}`
  });
  if (r.status !== 200) throw new Error("Dashboard failed");
  console.log("   OK online", r.json.onlineDevices);

  console.log("4. Create API key");
  r = await request("POST", "/api/apikey/create", { name: "Test Key" }, {
    Authorization: `Bearer ${token}`
  });
  if (r.status !== 200) throw new Error("API key failed");
  apiKey = r.json.key;
  console.log("   OK key created");

  console.log("5. Connect device");
  r = await request(
    "POST",
    "/api/device/connect",
    {
      device_name: "Test Android",
      phone_model: "Pixel Test",
      battery: 90,
      carrier: "TestNet",
      sim_number: "+919999999999"
    },
    { "X-API-Key": apiKey }
  );
  if (r.status !== 200) throw new Error("Device connect failed");
  deviceId = r.json.device_id;
  console.log("   OK device", deviceId);

  console.log("6. Send SMS via API");
  r = await request(
    "POST",
    "/api/sms/send",
    { phone_number: "9876543210", message: "Test message" },
    { "X-API-Key": apiKey }
  );
  if (r.status !== 200) throw new Error("Send failed");
  const requestId = r.json.request_id;
  console.log("   OK queued", requestId);

  console.log("7. Poll queue (Android simulation)");
  r = await request("GET", `/api/get?device_id=${deviceId}`, null, {
    "X-API-Key": apiKey
  });
  if (r.status !== 200 || !r.json.success) throw new Error("Get failed");
  console.log("   OK got message for", r.json.number);

  console.log("8. Mark done");
  r = await request(
    "POST",
    "/api/done",
    { id: r.json.id, request_id: r.json.request_id, device_id: deviceId, status: "sent" },
    { "X-API-Key": apiKey }
  );
  if (r.status !== 200) throw new Error("Done failed");
  console.log("   OK status", r.json.status);

  console.log("9. Send via dashboard panel");
  r = await request(
    "POST",
    "/api/sms/send-panel",
    { phone_number: "9876543211", message: "Panel test" },
    { Authorization: `Bearer ${token}` }
  );
  if (r.status !== 200) throw new Error("Panel send failed");
  console.log("   OK panel queued", r.json.request_id);

  console.log("10. Create webhook");
  r = await request(
    "POST",
    "/api/webhook/create",
    { url: "https://example.com/webhook" },
    { Authorization: `Bearer ${token}` }
  );
  if (r.status !== 200) throw new Error("Webhook failed");
  console.log("   OK webhook created");

  console.log("\nAll tests passed.");
}

run().catch((err) => {
  console.error("\nTest failed:", err.message);
  process.exit(1);
});
