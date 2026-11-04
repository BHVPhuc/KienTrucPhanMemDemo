# Phần 3: Microservices, Docker, Kubernetes & Service Mesh (Istio)

Thư mục này triển khai hệ thống Microservices mẫu cho sàn Thương mại điện tử (E-Commerce), bao gồm thiết kế **Bounded Context (Database-per-Service)**, đóng gói **Multi-stage Docker**, triển khai **Kubernetes (K8s)** với cơ chế Self-healing/HPA, cấu hình **Service Mesh (Istio)** (mTLS, Canary, Circuit Breaker) và hệ thống giám sát chỉ số **RED Metrics** qua Prometheus & Grafana.

---

## 1. Cơ sở Kiến trúc: Bounded Context & Database-per-Service

### 1.1. Phân rã theo Miền nghiệp vụ (Domain-Driven Design)

Hệ thống được chia thành 4 Microservices độc lập, mỗi dịch vụ sở hữu cơ sở dữ liệu riêng:

```mermaid
flowchart TD
    Client(["Client / Front-end"]) --> Ingress["API Gateway / Ingress Controller"]
    
    subgraph K8s_Cluster ["Kubernetes Cluster + Istio Service Mesh"]
        Ingress -->|Route /auth| S_Auth["Auth Service\n(Node.js / JWT)"]
        Ingress -->|Route /catalog| S_Cat["Catalog Service\n(Go / Node.js)"]
        Ingress -->|Route /orders| S_Ord["Order Service\n(Node.js / Express)"]
        Ingress -->|Route /payments| S_Pay["Payment Service\n(Python / FastAPI)"]

        S_Auth --- DB_Auth[("Auth DB\n(SQLite / Postgres)")]
        S_Cat --- DB_Cat[("Catalog DB\n(SQLite / Postgres)")]
        S_Ord --- DB_Ord[("Order DB\n(SQLite / Postgres)")]
        S_Pay --- DB_Pay[("Payment DB\n(SQLite / Postgres)")]

        S_Ord -.->|gRPC / REST (mTLS)| S_Cat
        S_Ord -.->|gRPC / REST (mTLS)| S_Pay
    end
```

### 1.2. So sánh Đánh đổi: Monolith vs Microservices

| Tiêu chí | Monolithic Architecture | Microservices Architecture |
| :--- | :--- | :--- |
| **Độc lập triển khai (Deployment)** | ❌ Phải build và deploy toàn bộ khối ứng dụng dù chỉ sửa 1 dòng code. | ✅ Từng dịch vụ (Order, Payment) release độc lập mà không ảnh hưởng dịch vụ khác. |
| **Cô lập lỗi (Fault Isolation)** | ❌ Một lỗi rò rỉ bộ nhớ (Memory leak) ở Module Báo cáo có thể đánh sập cả hệ thống. | ✅ Nếu Payment Service gặp sự cố, người dùng vẫn có thể xem danh mục Catalog bình thường. |
| **Khả năng mở rộng (Scalability)** | ❌ Phải scale toàn bộ Monolith (tốn RAM/CPU lãng phí). | ✅ Scale riêng Order Service từ 2 lên 20 Pods khi Flash Sale mà Catalog vẫn giữ nguyên 2 Pods. |
| **Chi phí vận hành (Operational Cost)**| ✅ Đơn giản, chỉ quản lý 1 pipeline CI/CD và 1 cụm cơ sở dữ liệu. | ❌ Rất cao, đòi hỏi Kubernetes, Istio, CI/CD tự động, tracing phân tán. |
| **Độ trễ mạng (Network Latency)** | ✅ Gọi hàm trong bộ nhớ (In-process memory call) tính bằng micro-giây. | ❌ Gọi qua mạng (gRPC/HTTP qua mTLS Envoy proxy) tính bằng mili-giây. |
| **Nhất quán dữ liệu (Data Consistency)**| ✅ Hỗ trợ giao dịch ACID tức thời (Local Transactions). | ❌ Chấp nhận Eventual Consistency; phải xử lý qua mẫu Saga hoặc Outbox. |

---

## 2. Hệ Sinh Thái Vận Hành Cloud-Native

### 2.1. Đóng gói Container với Docker (Kỹ thuật Multi-Stage Build)

Sử dụng **Multi-stage build** để loại bỏ compiler, development dependencies, công cụ build thừa thãi khỏi image cuối:

```dockerfile
# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Stage 2: Minimal Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Tạo non-root user để tăng tính bảo mật
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app /app
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
```

> **Lợi ích:** Giảm kích thước Docker Image từ **>800MB** xuống còn **~120MB**, giảm thiểu bề mặt tấn công CVE trong container.

---

### 2.2. Điều Phối Container với Kubernetes (K8s)

1. **Pod Lifecycle & Self-Healing:**
   - K8s tự động chạy `livenessProbe` và `readinessProbe`.
   - Nếu tiến trình ứng dụng bị crash hoặc rơi vào deadlock, K8s tự động khởi động lại Pod ngay lập tức (Self-healing).
2. **Service Discovery & Load Balancing:**
   - Sử dụng K8s CoreDNS và K8s Services (`ClusterIP`) để phân phối tải đều giữa các Pods mà không cần cấu hình IP cứng.
3. **Tự động mở rộng (Horizontal Pod Autoscaler - HPA):**
   - Tự động co giãn số lượng Pod dựa trên mức sử dụng CPU/Memory thực tế (ví dụ: khi CPU > 70%, nâng từ 2 lên tối đa 10 Pods).

---

### 2.3. Service Mesh với Istio (Envoy Sidecar Proxy)

```mermaid
flowchart LR
    subgraph Pod1 ["Order Service Pod"]
        App1["Order App Container"] <-->|localhost| Proxy1["Envoy Sidecar Proxy"]
    end

    subgraph Pod2 ["Payment Service Pod"]
        Proxy2["Envoy Sidecar Proxy"] <-->|localhost| App2["Payment App Container"]
    end

    Proxy1 ===|Mutual TLS (mTLS) Encrypted Wire| Proxy2
```

- **Mã hóa mTLS tự động:** Mọi giao tiếp giữa các Service qua Envoy đều được tự động cấp chứng chỉ X.509 và mã hóa 2 chiều mà không cần sửa 1 dòng code ứng dụng.
- **Canary Release (Điều phối lưu lượng):**
  - Cấu hình Istio `VirtualService` điều hướng 90% traffic vào phiên bản ổn định (`v1`) và 10% traffic vào phiên bản thử nghiệm (`v2`).
- **Circuit Breaking (Ngắt mạch tự động):**
  - Cấu hình Istio `DestinationRule` ngắt kết nối đến dịch vụ đích nếu tỷ lệ lỗi liên tiếp vượt quá ngưỡng (ví dụ: 5 lỗi 5xx trong 10s), bảo vệ hệ thống khỏi lỗi sập dây chuyền (Cascading Failure).

---

### 2.4. Khả Năng Quan Sát (Observability) với Chỉ Số RED

Hệ thống được cấu hình xuất chuẩn chỉ số **RED Metrics** (Rate, Errors, Duration) phục vụ Prometheus & Grafana:

1. **Rate (Tốc độ):** Số lượng request phục vụ mỗi giây (Requests per second - RPS).
2. **Errors (Lỗi):** Số lượng request thất bại (HTTP 4xx, 5xx) theo thời gian thực.
3. **Duration (Độ trễ):** Thời gian xử lý yêu cầu, trực quan hóa qua biểu đồ phân vị $p50, p90, p99$.

---

## 3. Cấu trúc Tệp tin trong Thư mục `03-microservices-k8s-mesh/`

- `services/`: Mã nguồn 4 dịch vụ độc lập (`auth-service`, `catalog-service`, `order-service`, `payment-service`).
- `docker/`: `docker-compose.yml` chạy giả lập môi trường toàn cục với đầy đủ mạng nội bộ và database độc lập.
- `k8s/`: Các tệp YAML cấu hình Kubernetes (Deployments, Services, HPA).
- `istio/`: Cấu hình Istio Gateway, VirtualService, DestinationRule (Canary & Circuit Breakers).
- `observability/`: Cấu hình Prometheus scraper & file dashboard JSON của Grafana.
