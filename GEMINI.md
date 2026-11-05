# NGUYÊN TẮC THIẾT KẾ & RÀNG BUỘC DEMO KIẾN TRÚC PHẦN MỀM (HCMUS)

Tài liệu này định nghĩa các quy tắc và ràng buộc bất di bất dịch đối với AI khi hướng dẫn, xây dựng và thực thi các bài demo kiến trúc trong kho lưu trữ này.

---

## 1. RÀNG BUỘC CỐT LÕI: TUYỆT ĐỐI KHÔNG DÙNG "WORKAROUND" (NO SHORTCUTS / NO FAKE MECHANISMS)
- **Công cụ thật, giao thức thật (Real Tools & Real Protocols):**
  - Khi đề tài hoặc bài học yêu cầu công cụ, nền tảng nào (Docker, Prometheus, Grafana, Message Broker như RabbitMQ/Kafka, EventStore, Redis, Kubernetes, Istio, Database...):
  - **BẮT BUỘC** phải cài đặt, cấu hình và chạy chính công cụ đó (hoặc công cụ thay thế chuẩn công nghiệp đã được thống nhất).
  - **TUYỆT ĐỐI CẤM:** Không tự viết code giả lập sơ sài (ad-hoc workaround) để "qua mắt" hoặc làm tắt (ví dụ: không tự viết trang web HTML/Canvas đơn giản rồi gọi đó là Grafana; không dùng mảng biến trong RAM `[]` rồi gọi là Event Store bền vững; không hardcode logic JSON rồi coi là Message Broker động).
- **Phản ánh đúng bản chất kỹ thuật (True Architectural Essence):**
  - Mọi gói tin truyền qua mạng (HTTP/REST, gRPC, AMQP, TCP), mã trạng thái (status code), cơ chế lưu trữ (Append-only Log, Read/Write model), cơ chế cào số liệu (Pull/Push Scraping), và phân tách tiến trình phải hoạt động thật 100% dưới tầng hệ điều hành.

---

## 2. QUY MÔ DEMO: VỪA VẶN, TẬP TRUNG VÀO KIẾN TRÚC CỐT LÕI (FOCUSED & SUFFICIENT SCOPE)
- **Không cồng kềnh, không phình to (No Bloated Systems):**
  - Không cần xây dựng các hệ thống enterprise khổng lồ với hàng chục microservices hay hàng nghìn dòng code nghiệp vụ dư thừa gây rối mắt, nặng máy và làm lu mờ kiến trúc chính.
- **Đủ rộng để bao quát trọn vẹn chủ đề (Sufficient Breadth):**
  - Các service phải được phân chia vừa vặn nhưng đầy đủ các vai trò kiến trúc then chốt để thể hiện trọn vẹn bản chất:
    - **Microservices & Observability:** Đủ phân rã Bounded Contexts độc lập (Write, Read, Payment, Catalog), giao tiếp liên dịch vụ thực tế (REST/gRPC), và hệ thống đo lường (Prometheus Server thật scrape `/metrics` + Grafana Server thật trực quan hóa).
    - **Event Sourcing & CQRS (Phần 5):** Tách bạch rõ rệt Command (Write Model) $\to$ Event Store lưu trữ bất biến (Append-only Event Log) $\to$ Projector chuyển dịch sự kiện $\to$ Query (Read Model / Materialized View) $\to$ Cơ chế Replay sự kiện và Snapshot khi khôi phục trạng thái.
    - **Event-Driven Architecture - EDA (Phần 6):** Đủ Producer $\to$ Message Broker thật (RabbitMQ/Kafka) với Exchange/Queue/Topic $\to$ Consumer độc lập, xử lý Idempotency, Dead-Letter Queue (DLQ), và Saga Pattern.
    - **JAMstack vs SSR (Phần 4):** Thể hiện rõ Build-time Pre-rendering (SSG), Edge CDN Caching, và Client-side Hydration qua API.

---

## 3. MỤC TIÊU HỌC THUẬT & PHỤC VỤ VẤN ĐÁP (ACADEMIC RIGOR)
- Người học cần hiểu sâu bản chất kỹ thuật (under the hood) để tự tin giải thích từng thành phần, từng cổng mạng, từng gói tin khi Thầy hỏi thi.
- Luôn cung cấp sơ đồ Mermaid chuẩn hóa (Sequence Diagram, Architecture Flowchart) và phân tích đánh đổi thuộc tính chất lượng (Trade-offs: Performance vs Consistency, Scalability vs Complexity).

