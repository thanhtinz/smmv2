// Mock cổng thanh toán cho test helper task 9: Stripe balance + SePay bank-accounts.
import http from "node:http";
const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || "";
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/balance") {
    if (auth === "Bearer sk_test_good") { res.writeHead(200); return res.end(JSON.stringify({ available: [{ amount: 12345, currency: "usd" }] })); }
    res.writeHead(401); return res.end(JSON.stringify({ error: { message: "Invalid API Key provided: sk_test_bad" } }));
  }
  if (req.url === "/v2/bank-accounts") {
    if (auth === "Bearer sepay_good") { res.writeHead(200); return res.end(JSON.stringify({ data: [{ id: "a1" }, { id: "a2" }] })); }
    res.writeHead(401); return res.end(JSON.stringify({ message: "Unauthenticated" }));
  }
  res.writeHead(404); res.end("{}");
});
server.listen(3997, "127.0.0.1", () => console.log("mock-pay on 3997"));
