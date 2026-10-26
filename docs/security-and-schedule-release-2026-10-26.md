# Lịch đăng ký, bảo mật và usage — 26/10/2026

## Nghiệp vụ và chuyển tiếp

- Chu kỳ mới áp dụng từ tuần làm việc **02–08/11/2026**. Mở đăng ký lúc 00:00 thứ Bảy 31/10; đúng hạn hết Chủ nhật 01/11; từ 00:00 thứ Hai 02/11 là gửi trễ.
- Theo lựa chọn của chủ app, hết Chủ nhật khóa sửa tự do. Thứ Hai sử dụng luồng đổi ca; lịch bị quản lý từ chối vẫn có luồng gửi lại, có kiểm tra khoản trừ/ngoại lệ.
- Checkbox miễn phí gửi lại được server tôn trọng: người gửi đúng hạn, bị từ chối trong ngày đầu trễ và được quản lý chọn miễn có thể gửi lại trong thứ Hai; ngoại lệ hết lúc 00:00 thứ Ba. Tên trường legacy `allowSundayResubmissionWithoutPenalty` được giữ để tương thích, ngày được tính theo policy.
- Giữ các diện miễn quản lý/lịch cố định/lần đầu/mở lại tài khoản của luồng đăng ký. Không sửa tiền phạt lịch sử. Hạn đăng ký/sửa của các tuần trước 02/11 giữ công thức cũ.
- Ngày yêu cầu đổi chế độ cố định/xoay ca vẫn là **thứ Bảy**; đây là luật riêng, chưa nhận lựa chọn thay đổi từ chủ app.
- Cron tạo lịch cố định chuyển sang thứ Bảy 00:00 Việt Nam (`0 17 * * 5`, UTC). Cron lưu trữ tuần vẫn thứ Hai, không dời theo cửa sổ đăng ký.
- Tính tuần, deadline và ngày gửi API theo Việt Nam; sửa lỗi thứ Hai 00:00 Việt Nam từng bị quy về tuần trước do dùng UTC.

## Bảo mật đã triển khai trong source

- API đánh giá nhân viên kiểm tra role và xưởng của nhân viên đích trước khi đọc lịch sử hoặc Drive; Host được xem hai xưởng. Dữ liệu tổng hợp cache 30 giây, quyền được kiểm tra trước cache mỗi lần.
- Tất cả vai trò nghiệp vụ phải active. Sau khi vô hiệu hóa và mở lại, `sessionsValidAfter` chặn token đăng nhập cũ tại API và Rules; chủ hồ sơ vẫn được đọc hồ sơ mình để hiển thị trạng thái/onboarding.
- Firestore Rules chặn quản lý đọc ngoài xưởng, kể cả truy vấn cố tình bỏ `factoryId`. Emulator đã tái hiện rule fallback cũ trả cả hai xưởng; đã thay bằng điều kiện trường trực tiếp và thêm test deny. Đây là tái hiện trên dữ liệu giả, không phải bằng chứng đã có tấn công trên production.
- Nhật ký audit mới có `factoryId` trong dữ liệu được băm. Audit legacy không có xưởng chỉ chủ thể và Host đọc; không đoán mặc định xưởng cho payload có thể chứa thông tin nhạy cảm.
- Chủ thông báo chỉ sửa `isRead`, metadata server giữ nguyên; admin không xóa thông báo của tài khoản khác qua client.
- Thiết bị thông báo tạo/cập nhật qua server, transaction giới hạn 5 thiết bị/tài khoản; refresh thiết bị cũ vẫn hoạt động khi đủ số lượng, không ghi `lastSeenAt` nhiều lần trong ngày nếu platform không đổi. Rules cấm client tự tạo/cập nhật, chỉ cho chủ active đọc/xóa.
- Upload ảnh: token hợp lệ; active/pending hoặc onboarding khi cổng đăng ký mở và mới đăng nhập; chặn inactive/phiên cũ. Budget transaction chỉ dùng cho upload: active tối đa 10 lần/ngày, onboarding/pending 3, toàn app 300, cách nhau tối thiểu 15 giây/UID. Tệp tối đa 5 MiB, body stream tối đa 6 MiB, giới hạn pixel, giải mã/re-encode thành WebP 512px trước Drive; recheck trạng thái trong transaction trước ghi hồ sơ và rollback tệp mới nếu ghi thất bại.
- Job tạo bản lưu toàn hệ thống chỉ cho Host/cron. Monthly archive có lease chống chạy đồng thời; UI quản lý xưởng không còn nút vận hành toàn hệ thống. Kho dữ liệu Host chọn xưởng dùng đúng xưởng đã chọn, không dùng xưởng mặc định của Host.
- API JSON giới hạn body stream; giới hạn burst theo UID trong từng instance; chặn tên action kế thừa từ prototype. Giới hạn tuần materialize lịch trước truy vấn/ghi, chỉ tuần hiện tại hoặc tuần kế tiếp đã mở.
- Cache hồ sơ localStorage chỉ giữ projection cho shell/avatar, loại email/điện thoại/Facebook/ngân hàng; dữ liệu cache cũ được lọc lại khi đọc, dọn cache khi logout. Guard hoàn thiện hồ sơ chờ snapshot thật để không chuyển nhầm trang khi cache đã rút gọn.
- Preview giả lập role chỉ hoạt động ở development. Production không chấp nhận bật preview bằng sessionStorage.
- Next.js 16.4.3, sharp 0.35.5; cập nhật dependency con tương thích. CSS shadcn được giữ trong repo kèm MIT license để bỏ bộ CLI khỏi dependency mà giữ các utility hiện có.
- Thêm chống nhúng, nosniff, Referrer-Policy. CSP đang **report-only**, chưa enforce để tránh làm hỏng Google Auth/FCM/PWA.

## Usage và giới hạn chi phí

- Giữ Firebase Spark và Vercel Hobby. Không bật billing/Blaze, nâng gói, mua add-on, TTL/PITR hoặc thêm dịch vụ trả phí.
- Bỏ audit và truy vấn hàng đợi email cho workflow chỉ đọc và lượt kiểm tra lịch cố định không tạo mới. Giữ audit khi có thay đổi và bỏ ghi trùng cho idempotent replay.
- Giới hạn truy vấn xuất lịch trực về tuần đang xem, vẫn đọc cả Timestamp và chuỗi ngày legacy. Chỉ lấy ứng lương Approved ở API Host, chỉ lấy Pending khi dọn yêu cầu nghỉ cũ; giới hạn đọc mẫu lịch cố định gần nhất.
- Cache cấu hình cổng đăng ký công khai 15 giây và projection mã nhân viên legacy 60 giây; server vẫn kiểm tra cổng đăng ký cho upload/đăng ký thật.
- Miễn index cho payload/result audit, targetIds workflow và các trường bookkeeping không truy vấn.
- Monitoring dùng metric theo database `(default)`, đếm từ reset Pacific có DST. Thiếu chuỗi dữ liệu/thiếu quyền hiển thị chưa đo được, không biến thành số 0. Health refresh thủ công có khoảng nghỉ 15 phút; gộp báo lỗi runtime 5 phút/instance, cảnh báo kỹ thuật chỉ trong Cài đặt và email vận hành đã cấu hình.
- Budget upload và lease monthly có thêm read/write nhỏ cho thao tác hiếm; không thêm counter Firestore cho mọi request hay listener avatar mới. Render React không tự động là một billable read.

## Kiểm tra trước phát hành

- 97 unit test đạt, gồm chạy hàm workflow thật với Firestore/Push fixture: ranh giới Chủ nhật–thứ Hai, miễn lần đầu/lịch cố định, khóa sửa dù deadline lưu cũ dài hơn, checkbox gửi lại sau chuyển `Editing`, chống ghi phạt trùng và từ chối tuần tùy ý.
- 9 nhóm kiểm thử Rules trên Firestore Emulator, project `demo-employee-security`: người ngoài/Auth-only/pending/inactive/revoked, giả role, đọc đúng/sai xưởng, query hợp lệ, ownership/schema/type/size/timestamp, audit, metadata thông báo, orphaned devices, bookkeeping server-only. Tất cả đạt; validator Firebase không có lỗi/cảnh báo sau sửa.
- TypeScript không lỗi. Lint toàn repo: 0 lỗi, còn cảnh báo có sẵn và các cảnh báo khuyến nghị React/ảnh.
- 20 bài kiểm thử UI headless Android Chrome/iPhone Safari đạt. Sửa vùng bấm chọn tháng lên >=44px và cập nhật nhãn test xuất Excel theo “tuần này” của giao diện hiện hành.
- Production build cuối thành công sau các thay đổi ứng dụng.
- `pnpm audit --prod`: 0 critical/high, còn 2 entry moderate thuộc uuid transitively trong ExcelJS/Google SDK. App không gọi API uuid v3/v5/v6 truyền buffer; không ép nâng major transitive làm rủi ro hỏng SDK. Không kết luận dependency hoàn toàn không còn lỗ hổng.
- Metadata production đọc bằng Firebase connector, chỉ mask `factoryId/employeeId`: 12 hồ sơ, 73 lịch, 1 nghỉ, 1 trễ; các collection còn lại đã kiểm tra rỗng. Không có record thiếu/sai xưởng hay orphan cần sửa. Không chuyển đổi dữ liệu thật. Script backfill mặc định dry-run có chặn nhầm project/read budget, chỉ dùng nếu phát sinh legacy trong tương lai và có credential hợp lệ.

## Thứ tự phát hành và giới hạn còn lại

1. Xác nhận test/build cuối và đúng project Firebase/Vercel.
2. Deploy indexes trước ứng dụng, xác nhận các index query cần thiết sẵn sàng.
3. Phát hành ứng dụng có endpoint thiết bị và writer ghi factory; kiểm tra trạng thái READY.
4. Kiểm tra lại metadata còn đủ factory rồi deploy Rules chặt hơn. Kiểm tra HTTP/headers và API không đăng nhập, không tạo dữ liệu nghiệp vụ production để thử.
5. Mở lại/refresh ứng dụng để nhận client mới, đặc biệt luồng đăng ký thiết bị thông báo đã chuyển sang API.

Những việc **chưa được coi là hoàn tất**:

- Service account production chưa có số liệu Monitoring trong snapshot khảo sát. Không tự mở rộng IAM/API. Code đã xử lý unknown và mốc reset, nhưng cần cấp quyền đọc metrics phù hợp để có số đo tự động thật.
- Chưa bật/enforce App Check hoặc publish WAF rule mới. Burst memory không phải giới hạn toàn hệ thống trong serverless và không thay thế WAF/App Check; quota cap upload và device transaction là các chặn bền vững cho hai đường ghi cụ thể. Không có bảo đảm chống mọi bot/DDoS.
- Avatar còn public theo URL và cache CDN/browser dài như trước; chưa chuyển ảnh sang private auth vì cần thiết kế quyền/cache và lựa chọn sản phẩm. Không thể thu hồi mọi bản cache cũ bằng xóa file gốc.
- Vercel Hobby có điều kiện chỉ dùng cá nhân phi thương mại. Yêu cầu không nâng gói được giữ; usage thấp không tự giải quyết điều kiện sử dụng cho app vận hành xưởng. Chưa di chuyển hosting sang nền tảng khác.
- Chưa kiểm thử khôi phục backup, kiểm toán toàn bộ IAM/MFA/OAuth hoặc tải 80 người trên production. Không load-test/khai thác hệ thống thật.

Security Rules notice: I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for authenticated ownership, active sessions, factory isolation and server-only business writes. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
