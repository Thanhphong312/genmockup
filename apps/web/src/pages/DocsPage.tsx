import type { ReactNode } from 'react';
import {
  Image,
  Shirt,
  Wand2,
  Droplet,
  Sparkles,
  Cloud,
  Settings,
  User,
  Users,
  Share2,
  BookOpen,
} from 'lucide-react';
import { Card } from '../components/ui';

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="p-5 scroll-mt-20">
      <h2 className="flex items-center gap-2 text-lg font-bold mb-3">
        <span className="text-brand-600">{icon}</span> {title}
      </h2>
      <div className="text-sm text-slate-700 space-y-2 leading-relaxed">{children}</div>
    </Card>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal pl-5 space-y-1">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

const TOC = [
  ['gioi-thieu', 'Giới thiệu'],
  ['mockups', 'Mockups (Card)'],
  ['bo-ao', 'Bộ áo (Shirt sets)'],
  ['new-idea', 'New Idea (AI)'],
  ['watermarks', 'Watermarks'],
  ['generate', 'Generate'],
  ['drive', 'Upload Google Drive'],
  ['chia-se', 'Chia sẻ'],
  ['cai-dat', 'Cài đặt'],
  ['ho-so', 'Hồ sơ'],
  ['nguoi-dung', 'Người dùng (admin)'],
  ['luu-y', 'Mẹo & lưu ý'],
];

export default function DocsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold mb-1">
        <BookOpen className="w-6 h-6 text-brand-600" /> Hướng dẫn sử dụng
      </h1>
      <p className="text-sm text-slate-500 mb-6">Cách dùng tất cả các mục trong hệ thống.</p>

      {/* Mục lục */}
      <Card className="p-4 mb-6">
        <div className="font-semibold text-sm mb-2">Mục lục</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-brand-600 hover:underline">
              {label}
            </a>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        <Section id="gioi-thieu" icon={<BookOpen className="w-5 h-5" />} title="Giới thiệu">
          <p>
            Hệ thống ghép <strong>design</strong> (ảnh thiết kế) vào <strong>mockup</strong> (ảnh nền:
            card/ốp hoặc áo) để tạo ảnh sản phẩm, kèm công cụ <strong>AI New Idea</strong> tạo thiết kế
            mới và tiêu đề đăng bán.
          </p>
          <p>
            Dữ liệu <strong>riêng theo từng tài khoản</strong>: mỗi người chỉ thấy mockup / bộ áo / ý
            tưởng của mình (trừ khi được người khác chia sẻ).
          </p>
        </Section>

        <Section id="mockups" icon={<Image className="w-5 h-5" />} title="Mockups (Card / Ốp)">
          <p>Mockup là <strong>1 ảnh đơn</strong> có vùng đặt design (thường ảnh có nền trong suốt nơi design lộ ra).</p>
          <Steps
            items={[
              <>Bấm <strong>Thêm mockup</strong> → upload ảnh (PNG/JPG) + đặt tên.</>,
              <>Bấm <strong>Sửa</strong> để vào editor: kéo/scale khung design (khoá tỉ lệ 5:7), thêm watermark nếu cần, dùng nút <strong>căn chỉnh</strong> (trên/dưới/trái/phải/giữa) → <strong>Lưu vị trí</strong>.</>,
              <>Nút <strong>🔗 Chia sẻ</strong> để cho user khác dùng mockup này khi generate.</>,
              <>Mockup dùng ở tab <strong>Generate</strong> chế độ Card.</>,
            ]}
          />
        </Section>

        <Section id="bo-ao" icon={<Shirt className="w-5 h-5" />} title="Bộ áo (Shirt sets)">
          <p>
            Mỗi <strong>bộ</strong> là 1 folder nhiều <strong>màu áo</strong> (ảnh đục), các màu dùng
            chung 1 vị trí design. Ảnh áo lấy từ đĩa: <code>mockup/shirt/&lt;bộ&gt;/&lt;màu&gt;.png</code>.
          </p>
          <Steps
            items={[
              <>Copy ảnh vào <code>mockup/shirt/...</code> rồi bấm <strong>Scan/Import từ đĩa</strong>.</>,
              <>Bấm <strong>Sửa vị trí</strong>: chọn màu xem trước, đặt khung design (dùng chung mọi màu) → Lưu.</>,
              <>Nút <strong>🔗 Chia sẻ</strong> cấp quyền dùng bộ áo cho user khác.</>,
              <>Dùng ở <strong>Generate</strong> chế độ Áo — design vẽ <strong>đè lên</strong> áo.</>,
            ]}
          />
        </Section>

        <Section id="new-idea" icon={<Wand2 className="w-5 h-5" />} title="New Idea (AI)">
          <p>
            Tạo thiết kế mới bằng OpenAI (cần <strong>nhập API key ở Cài đặt</strong> trước). Ảnh sinh
            ra là <strong>design nền trong suốt</strong>.
          </p>
          <Steps
            items={[
              <>Upload <strong>ảnh gốc</strong> + <strong>Title</strong> + <strong>Keyword</strong>.</>,
              <>Chọn chế độ <strong>Trademark</strong>: Hạn chế (an toàn POD) / Lấy luôn / Mặc định.</>,
              <>Bấm <strong>Phân tích &amp; tạo 4 ý tưởng</strong> (chạy nền, hiện tiến độ). Mỗi ảnh kèm <strong>💰 điểm bán</strong> và <strong>🏷️ title đăng bán</strong> tự sinh.</>,
              <>Tick ảnh ưng ý → <strong>Lưu ảnh đã chọn</strong> vào thư viện.</>,
            ]}
          />
          <p className="font-medium mt-2">Trong thư viện ý tưởng:</p>
          <Bullets
            items={[
              <><strong>Gen title</strong>: nhập template + keyword → sinh lại 1 title (điền sẵn keyword cũ).</>,
              <><strong>Apply áo</strong>: mang ảnh ý tưởng sang Generate (Áo); nếu đã có title thì title theo sang kết quả.</>,
              <>Badge <strong>“đã gen N”</strong>: số lần đã dùng ý tưởng để gen mockup.</>,
            ]}
          />
        </Section>

        <Section id="watermarks" icon={<Droplet className="w-5 h-5" />} title="Watermarks">
          <p>Upload ảnh watermark (PNG nền trong suốt là đẹp nhất). Khi Generate, chọn watermark ở bước 3; vị trí watermark đặt trong editor của từng mockup / bộ áo.</p>
        </Section>

        <Section id="generate" icon={<Sparkles className="w-5 h-5" />} title="Generate">
          <p>Ghép design vào mockup. Có 2 chế độ: <strong>Card</strong> và <strong>Áo</strong>.</p>
          <Steps
            items={[
              <><strong>Design</strong>: upload file, dán URL, hoặc dùng ảnh ý tưởng (khi bấm “Apply áo”).</>,
              <>Chế độ <strong>Card</strong>: chọn 1+ mockup. Chế độ <strong>Áo</strong>: chọn 1+ bộ áo + đặt <strong>vị trí design cho từng bộ</strong> (kéo/scale/căn chỉnh) + nhập <strong>số lượng</strong> (mặc định 6, random mỗi ảnh 1 màu khác nhau).</>,
              <>Chọn <strong>Watermark</strong> (tuỳ chọn) → bấm <strong>Generate</strong>.</>,
              <>Kết quả: xem/tải từng ảnh; có <strong>🏷️ title</strong> (nếu từ ý tưởng, kèm nút Copy); nút <strong>Upload to Drive</strong>.</>,
            ]}
          />
        </Section>

        <Section id="drive" icon={<Cloud className="w-5 h-5" />} title="Upload Google Drive">
          <p>
            Mỗi user kết nối <strong>Drive riêng của mình</strong> (token lưu riêng theo tài khoản).
            Kết nối bằng cách tự tạo <strong>Google Cloud OAuth</strong> rồi dán JSON token vào{' '}
            <strong>Cài đặt → Google Drive</strong>.
          </p>

          <p className="font-medium mt-2">A. Import token JSON (khuyến nghị)</p>
          <p>
            JSON cần đủ 3 trường; hệ thống sẽ <strong>thử refresh để xác minh</strong> trước khi lưu:
          </p>
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-md p-3 overflow-x-auto">{`{
  "client_id": "xxxx.apps.googleusercontent.com",
  "client_secret": "GOCSPX-xxxx",
  "refresh_token": "1//0gxxxx"
}`}</pre>

          <p className="font-medium mt-3">B. Cách lấy 3 trường trên</p>
          <Steps
            items={[
              <>
                <strong>Google Cloud Console</strong> (console.cloud.google.com): tạo{' '}
                <strong>New Project</strong> bằng tài khoản Google chứa Drive muốn dùng.
              </>,
              <>
                <strong>APIs &amp; Services → Library</strong> → tìm <strong>Google Drive API</strong> →{' '}
                <strong>Enable</strong>.
              </>,
              <>
                <strong>OAuth consent screen</strong>: chọn <strong>External</strong>, điền tên/email;
                ở <strong>Test users</strong> thêm chính email Google của bạn.
              </>,
              <>
                <strong>Credentials → Create Credentials → OAuth client ID</strong>, loại{' '}
                <strong>Web application</strong>. Thêm <strong>Authorized redirect URI</strong>:{' '}
                <code>https://developers.google.com/oauthplayground</code>. Bấm Create → copy{' '}
                <strong>Client ID</strong> &amp; <strong>Client secret</strong>.
              </>,
              <>
                Vào <strong>developers.google.com/oauthplayground</strong> → ⚙️ tích{' '}
                <strong>Use your own OAuth credentials</strong> → điền Client ID/Secret vừa tạo.
              </>,
              <>
                Ô scope dán <code>https://www.googleapis.com/auth/drive</code> →{' '}
                <strong>Authorize APIs</strong> → đăng nhập &amp; Allow →{' '}
                <strong>Exchange authorization code for tokens</strong> → copy{' '}
                <strong>Refresh token</strong>.
              </>,
              <>
                Ghép 3 trường thành JSON, dán vào <strong>Cài đặt → Google Drive → Token JSON</strong> →{' '}
                <strong>Kết nối bằng JSON</strong>.
              </>,
            ]}
          />

          <p className="font-medium mt-3">C. Upload ảnh</p>
          <Steps
            items={[
              <>Ở kết quả Generate → <strong>Upload to Drive</strong>.</>,
              <>Chọn/tạo folder → <strong>Upload</strong> (ảnh + design vào subfolder “design”).</>,
              <>Ngắt kết nối: nút <strong>Ngắt kết nối</strong> ở Cài đặt, hoặc <strong>Disconnect</strong> trong cửa sổ upload.</>,
            ]}
          />

          <p className="font-medium mt-3">Lỗi thường gặp</p>
          <Bullets
            items={[
              <><code>missing_refresh_token</code>: JSON thiếu refresh_token — nhớ tích “Use your own OAuth credentials” và bấm Exchange ở Playground.</>,
              <><code>token_verification_failed</code>: token sai/đã thu hồi hoặc client_id/secret không khớp — lấy lại refresh_token mới.</>,
              <>Playground không trả refresh_token: gỡ quyền app tại <code>myaccount.google.com/permissions</code> rồi authorize lại.</>,
            ]}
          />
          <p className="text-xs text-slate-500 mt-2">
            <strong>Bảo mật:</strong> refresh_token cho phép truy cập Drive dài hạn — không chia sẻ JSON cho người khác.
          </p>
        </Section>

        <Section id="chia-se" icon={<Share2 className="w-5 h-5" />} title="Chia sẻ mockup / bộ áo">
          <p>Chủ sở hữu (hoặc admin) chia sẻ <strong>quyền dùng</strong> mockup card, bộ áo hoặc mockup card skin cho user khác.</p>
          <Bullets
            items={[
              <>Bấm nút <strong>🔗 Chia sẻ</strong> → tick user muốn cho dùng.</>,
              <>Người được chia sẻ: <strong>chỉ chọn để Generate</strong>, thấy badge tên chủ, <strong>không sửa/xoá/chia sẻ lại</strong>.</>,
              <>Thu hồi: bỏ tick user trong cùng cửa sổ chia sẻ.</>,
              <>
                <strong>Card skin — chia sẻ hàng loạt:</strong> tick ô vuông ở góc trên trái từng
                mockup (hoặc <strong>Chọn tất cả</strong>) → <strong>Chia sẻ N</strong> → chọn nhiều
                user → <strong>Chia sẻ</strong> / <strong>Thu hồi</strong>. Badge cạnh mỗi user cho
                biết đang chia sẻ <em>Tất cả</em> hay chỉ <em>một phần</em> số mockup đã chọn.
              </>,
            ]}
          />
        </Section>

        <Section id="cai-dat" icon={<Settings className="w-5 h-5" />} title="Cài đặt">
          <Bullets
            items={[
              <><strong>OpenAI API key</strong> (bắt buộc cho New Idea) — lưu riêng theo user, chỉ hiện 4 số cuối.</>,
              <><strong>Model phân tích</strong> / <strong>Model tạo ảnh</strong> / <strong>Chất lượng ảnh</strong> (low/medium/high) — ảnh hưởng chi phí OpenAI.</>,
            ]}
          />
        </Section>

        <Section id="ho-so" icon={<User className="w-5 h-5" />} title="Hồ sơ">
          <p>Tự đổi <strong>username</strong> và <strong>mật khẩu</strong> của mình (đổi mật khẩu cần nhập mật khẩu hiện tại). Không cần đăng nhập lại sau khi đổi.</p>
        </Section>

        <Section id="nguoi-dung" icon={<Users className="w-5 h-5" />} title="Người dùng (chỉ admin)">
          <Bullets
            items={[
              <><strong>Tạo user</strong> (username + mật khẩu + quyền user/admin).</>,
              <><strong>Đổi mật khẩu</strong> / <strong>nâng-hạ quyền</strong> / <strong>xoá</strong> user (xoá kèm toàn bộ dữ liệu của họ).</>,
              <>Mỗi user có dữ liệu + OpenAI key + Drive riêng.</>,
              <>
                <strong>Chuyển sở hữu</strong>: chuyển mockup card / bộ áo / card skin / watermark /
                ảnh ý tưởng / lịch sử generate của 1 user sang user khác — tick loại muốn chuyển
                (có sẵn số lượng). Dùng khi nhân sự nghỉ mà không muốn mất dữ liệu:{' '}
                <strong>chuyển trước, xoá user sau</strong>.
              </>,
              <>
                <strong>Đổi chủ từng item</strong>: bật <strong>“Xem của tất cả user”</strong> ở
                trang Mockups / Bộ áo / Card skin / Watermarks để thấy toàn bộ, rồi bấm nút{' '}
                <strong>⇄</strong>{' '}
                trên item (card skin chọn nhiều rồi <strong>Đổi chủ N</strong>). Admin chỉ{' '}
                <em>xem và đổi chủ</em>, không sửa/xoá được đồ của người khác.
              </>,
              <>Bộ áo trùng tên bên chủ mới sẽ tự thêm hậu tố <code>(2)</code> thay vì báo lỗi.</>,
            ]}
          />
        </Section>

        <Section id="luu-y" icon={<Sparkles className="w-5 h-5" />} title="Mẹo & lưu ý">
          <Bullets
            items={[
              <><strong>Chi phí OpenAI</strong>: mỗi lần New Idea = 1 lượt phân tích + 4 ảnh; hạ <strong>Chất lượng</strong> xuống low khi thử.</>,
              <><strong>Trademark</strong>: để “Hạn chế” cho an toàn khi in bán; “Lấy luôn” có thể bị OpenAI từ chối.</>,
              <><strong>gpt-image-1</strong> có thể cần Google/OpenAI org verified; lỗi sẽ hiện rõ trong tiến trình.</>,
              <>Nếu web không vào được (xoay mãi / ERR_CONNECTION_CLOSED) qua tên miền: thử tắt <strong>QUIC</strong> ở <code>chrome://flags/#enable-quic</code> hoặc dùng <code>localhost:3000</code>.</>,
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
