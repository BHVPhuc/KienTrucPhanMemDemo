---
description: "Ràng buộc demo kiến trúc phần mềm: Không workaround, dùng công cụ thật, quy mô vừa đủ bao quát core architecture"
globs: ["**/*"]
---

# Ràng Buộc Demo Kiến Trúc Phần Mềm (HCMUS)

1. **Tuyệt đối KHÔNG workaround:**
   - Không tự viết HTML/Canvas giả lập làm Grafana.
   - Không dùng mảng RAM `[]` làm Event Store hay Message Broker.
   - Dùng đúng công cụ thật (Docker, Prometheus Server, Grafana Server, RabbitMQ/Kafka, EventStore/DB).

2. **Quy mô vừa vặn, đủ rộng bao quát Core Architecture:**
   - Không cồng kềnh quá mức gây nặng máy.
   - Đủ các thành phần đại diện để thể hiện trọn vẹn bản chất kiến trúc (Bounded Context, Write/Read model CQRS, Append-only Event Log, Broker Queue/Topic, Saga, mTLS...).

3. **Mục tiêu vấn đáp & hiểu bản chất:**
   - Hiểu rõ đường đi gói tin mạng, cổng giao tiếp, luồng dữ liệu dưới tầng OS/Network.
   - Thuyết minh dựa trên Thuộc tính chất lượng (Quality Attributes) & Đánh đổi kiến trúc (Trade-offs).

