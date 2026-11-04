# HƯỚNG DẪN THỰC HÀNH CHẠY DEMO GOOGLE ONLINE BOUTIQUE (11 MICROSERVICES)
## Thư mục mục tiêu: `03-microservices-k8s-mesh/microservices-demo`

Tài liệu này hướng dẫn chạy và demo **100% dự án Google Cloud Online Boutique** gồm đầy đủ **11 microservices gRPC** (+ 1 Redis database + 1 Load Generator) với 2 phương án tùy chọn: **Docker Compose** hoặc **Kubernetes**.

---

## 1. Bảng So Sánh 2 Phương Án Chạy `microservices-demo`

| Tiêu chí | Phương Án 1: Docker Compose | Phương Án 2: Kubernetes (K8s) |
| :--- | :--- | :--- |
| **Hệ thống chạy** | Toàn bộ 11 Microservices của Google | Toàn bộ 11 Microservices của Google |
| **Tệp cấu hình** | [`microservices-demo/docker-compose.yml`](./microservices-demo/docker-compose.yml) | [`microservices-demo/release/kubernetes-manifests.yaml`](./microservices-demo/release/kubernetes-manifests.yaml) |
| **Yêu cầu máy tính** | Chỉ cần Docker Desktop đang chạy | Docker Desktop bật tính năng Kubernetes |
| **Thời gian khởi động** | $\approx 30 - 45$ giây | $\approx 1 - 2$ phút |
| **Mục đích phù hợp** | Dựng nhanh gọn, nhẹ máy, mở web mua sắm ngay lập tức. | Chuẩn giáo trình Cloud-Native/K8s của Thầy Biên (chứng minh Pods, Probes, Services). |

---

## 2. Phương Án 1: Chạy Bằng Docker Compose (Nhanh & Tiện Lợi Nhất)

Phương án này sử dụng trực tiếp các Docker images chính chủ của Google Cloud từ Container Registry (`us-central1-docker.pkg.dev/...`) để chạy toàn bộ 11 microservices mà không cần build mã nguồn.

### Bước 1: Mở Docker Desktop
- Bật ứng dụng **Docker Desktop** trên Windows và chờ biểu tượng cá voi chuyển sang màu xanh.

### Bước 2: Khởi chạy 11 microservices bằng 1 lệnh
Mở cửa sổ PowerShell và chạy:
```powershell
cd d:\HCMUS\semester7\software-architecture\midterm\KienTrucPhanMemDemo\03-microservices-k8s-mesh\microservices-demo

# Khởi chạy toàn bộ 11 microservices và Redis dưới nền:
docker compose up -d
```

### Bước 3: Kiểm tra trạng thái các container
```powershell
docker compose ps
```
Bạn sẽ thấy 12 containers đều ở trạng thái `Up / Running`:
1. `frontend` (Go - Web UI cổng 8080)
2. `cartservice` (C# .NET)
3. `productcatalogservice` (Go)
4. `currencyservice` (Node.js)
5. `paymentservice` (Node.js)
6. `shippingservice` (Go)
7. `emailservice` (Python)
8. `checkoutservice` (Go)
9. `recommendationservice` (Python)
10. `adservice` (Java)
11. `loadgenerator` (Python Locust)
12. `redis-cart` (Redis Database)

### Bước 4: Mở trình duyệt trải nghiệm
Truy cập ngay vào:
👉 **`http://localhost:8080`**

### Bước 5: Dừng cụm khi demo xong
```powershell
docker compose down
```

---

## 3. Phương Án 2: Chạy Bằng Kubernetes (Chuẩn Môn Học Của Thầy Biên)

Dành cho trường hợp bạn muốn demo đúng chuẩn Kubernetes (Deployments, Pods, Services, Probes) cho Thầy xem.

### Bước 1: Kích hoạt Kubernetes trên máy
1. Mở **Docker Desktop** $\to$ click vào biểu tượng bánh răng **Settings**.
2. Chọn mục **Kubernetes** ở cột bên trái $\to$ tick chọn **Enable Kubernetes**.
3. Bấm **Apply & restart** (chờ 1-2 phút để cụm K8s khởi tạo).
4. Kiểm tra cụm đã sẵn sàng:
   ```powershell
   kubectl get nodes
   ```
   *(Thấy node `docker-desktop` báo trạng thái `Ready` là xong)*.

### Bước 2: Triển khai toàn bộ manifest lên K8s
Mở PowerShell tại thư mục `microservices-demo`:
```powershell
cd d:\HCMUS\semester7\software-architecture\midterm\KienTrucPhanMemDemo\03-microservices-k8s-mesh\microservices-demo

# Triển khai toàn bộ 11 microservices bằng file manifest chính thức của Google:
kubectl apply -f release/kubernetes-manifests.yaml
```

### Bước 3: Theo dõi các Pods khởi động
```powershell
kubectl get pods
```
Chờ khoảng 1 phút đến khi tất cả các Pod chuyển sang `1/1 Running`.

### Bước 4: Chuyển tiếp cổng (Port-forward) để mở web
```powershell
kubectl port-forward deployment/frontend 8080:8080
```
Mở trình duyệt truy cập:
👉 **`http://localhost:8080`**

### Bước 5: Xóa cụm K8s sau khi demo xong
```powershell
kubectl delete -f release/kubernetes-manifests.yaml
```

---

## 4. Kịch Bản Thao Tác Trực Tiếp Trên Web Demo Cho Thầy Xem

Dù chạy bằng **Docker Compose (Cách 1)** hay **Kubernetes (Cách 2)**, trang web `http://localhost:8080` đều hoạt động giống hệt nhau. Bạn hãy thực hiện 4 bước sau để thuyết trình:

1. **Bước 1 (Xem trang chủ & Gợi ý sản phẩm):**
   - Giải thích: `frontend` (Go) vừa gọi song song 2 lệnh gRPC: gọi `productcatalogservice` (Go) lấy danh sách đồ và gọi `recommendationservice` (Python) để tính toán gợi ý sản phẩm phù hợp.
2. **Bước 2 (Chuyển đổi loại tiền tệ):**
   - Click vào thanh chọn tiền tệ ở góc phải màn hình, đổi sang **EUR (€)** hoặc **JPY (¥)**.
   - Giải thích: `frontend` lập tức gọi gRPC sang `currencyservice` (Node.js) để quy đổi tỷ giá theo dữ liệu của Ngân hàng Trung ương Châu Âu.
3. **Bước 3 (Thêm sản phẩm vào giỏ hàng):**
   - Chọn một sản phẩm $\to$ bấm **Add to Cart**.
   - Giải thích: `frontend` gọi gRPC sang `cartservice` (C#) để ghi dữ liệu giỏ hàng vào cụm **Redis Database** (`redis-cart`).
4. **Bước 4 (Thanh toán đơn hàng - Điểm đắt giá nhất):**
   - Bấm vào biểu tượng Giỏ hàng $\to$ bấm nút **Place Order**.
   - Giải thích: `checkoutservice` (Go) đóng vai trò là **Saga Orchestrator** điều phối một chuỗi giao dịch liên hoàn:
     1. Gọi `cartservice` lấy thông tin giỏ hàng.
     2. Gọi `paymentservice` (Node.js) xác thực và trừ tiền thẻ tín dụng.
     3. Gọi `shippingservice` (Go) sinh mã vận đơn giao hàng.
     4. Gọi `emailservice` (Python) gửi email xác nhận.
     5. Gọi `cartservice` xóa sạch giỏ hàng trong Redis sau khi hoàn tất.
