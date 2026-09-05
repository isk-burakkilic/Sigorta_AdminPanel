// ============================================================
//  HelpGuide.jsx — üst bardaki "❓ Nasıl Kullanılır?" tam ekran kılavuzu.
//
//  Amaç: panelin nasıl kullanılacağını görsel + metinle anlatan tek bir
//  başvuru sayfası. En kritik bölüm Excel Formatı'dır — Üretim Listesi'ne
//  içe aktarılan dosyada sunucunun TANIDIĞI sütun başlıkları sabittir
//  (server/src/routes/policies.js → IMPORT_MAP); tanınmayan bir başlık
//  sessizce yok sayılır, hata vermez. Kullanıcı bunu bilmezse "içe
//  aktardım ama alan boş geldi" şikayeti gelir — bu yüzden tablo burada
//  IMPORT_MAP ile birebir eşleşmelidir; sunucuda yeni bir sütun tanınırsa
//  bu dosya da güncellenmeli.
// ============================================================
import { useState } from 'react';

const SECTIONS = [
  { key: 'genel', icon: '🧭', title: 'Genel Bakış' },
  { key: 'uretim', icon: '📁', title: 'Üretim Listesi' },
  { key: 'excel', icon: '📊', title: 'Excel Formatı', badge: 'Kritik' },
  { key: 'kontak', icon: '🔎', title: 'Kontak Arama & Müşteri 360' },
  { key: 'cari', icon: '💳', title: 'Cari Hesap' },
  { key: 'takip', icon: '🔔', title: 'Takip Edilen İşler' },
  { key: 'grafikler', icon: '📈', title: 'Grafikler' },
  { key: 'uygulamalar', icon: '🧰', title: 'Uygulamalar' },
  { key: 'destek', icon: '✉️', title: 'Destek' },
];

// Excel içe aktarımının tanıdığı sütun başlıkları — server/src/routes/policies.js
// IMPORT_MAP ile birebir aynı olmalı. Aynı alan için birden fazla kabul edilen
// yazım varsa aynı satırda gösterilir.
const EXCEL_COLUMNS = [
  { heads: ['Hesap Adı'], field: 'Hesap Adı (Müşteri)', required: true, note: 'Otomatik BÜYÜK harfe çevrilir.' },
  { heads: ['Bitiş Tarihi'], field: 'Poliçe Bitiş Tarihi', required: true, note: 'Excel’de gerçek tarih hücresi olmalı.' },
  { heads: ['Poliçe Türü'], field: 'Poliçe Türü', required: true },
  { heads: ['Sigorta Şirketi Adı'], field: 'Sigorta Şirketi', required: true },
  { heads: ['TC Kimlik No'], field: 'TC Kimlik No', required: 'tcVergi', note: 'Rakam dışı her şey otomatik temizlenir.' },
  { heads: ['Vergi Kimlik No'], field: 'Vergi Kimlik No', required: 'tcVergi', note: 'Rakam dışı her şey otomatik temizlenir.' },
  { heads: ['Araç Plakası'], field: 'Araç Plakası' },
  { heads: ['Brüt (TL)'], field: 'Brüt Prim' },
  { heads: ['Brüt 2026 (TL)', 'Brüt 2026'], field: 'Güncel Prim (yenileme)' },
  { heads: ['GSM No'], field: 'GSM No' },
  { heads: ['Doğum Tarihi'], field: 'Doğum Tarihi' },
  { heads: ['Poliçe Numarası'], field: 'Poliçe No' },
  { heads: ['Prodüktör/ Tali Adı', 'Prodüktör/Tali Adı'], field: 'Prodüktör / Tali Adı' },
  { heads: ['Sistem Durum', 'Sistem_Durum'], field: 'Durum', note: 'Boşsa "Çalışılmadı" atanır.' },
  { heads: ['Belge Seri No', 'Belge Seri Numarası'], field: 'Belge Seri No' },
  { heads: ['Notlar / Açıklamalar', 'Notlar/Açıklamalar'], field: 'Notlar' },
  { heads: ['Gönderilecek Otomatik Mesaj'], field: 'Otomatik Mesaj' },
];

function ExcelHeaderMock() {
  const cols = ['Hesap Adı', 'Bitiş Tarihi', 'Poliçe Türü', 'Sigorta Şirketi Adı', 'Brüt (TL)', 'TC Kimlik No'];
  return (
    <div className="hlp-mock" role="img" aria-label="Örnek Excel başlık satırı">
      <div className="hlp-mock-row hlp-mock-head">
        {cols.map((c) => <div key={c} className="hlp-mock-cell">{c}</div>)}
      </div>
      <div className="hlp-mock-row">
        <div className="hlp-mock-cell">MEHMET YILMAZ</div>
        <div className="hlp-mock-cell">15.03.2027</div>
        <div className="hlp-mock-cell">Trafik Poliçesi</div>
        <div className="hlp-mock-cell">Anadolu Sigorta</div>
        <div className="hlp-mock-cell">7.795,45</div>
        <div className="hlp-mock-cell">12345678901</div>
      </div>
    </div>
  );
}

function ReqBadge({ required }) {
  if (required === true) return <span className="hlp-badge hlp-badge-req">Zorunlu</span>;
  if (required === 'tcVergi') return <span className="hlp-badge hlp-badge-opt">TC veya VKN’den biri</span>;
  return <span className="hlp-badge hlp-badge-free">İsteğe bağlı</span>;
}

function SectionGenel() {
  return (
    <>
      <h2>🧭 Genel Bakış</h2>
      <p>
        Panel üç ana bloktan oluşur: solda <b>kenar çubuğu</b> (Üretim Listesi, Takip Edilen İşler,
        Grafikler, Uygulamalar, Ayarlar), üstte <b>üst bar</b> (geri butonu, bildirim zili, tema
        anahtarı, ayarlar dişlisi ve bu kılavuz), ortada ise seçtiğiniz ekranın içeriği.
      </p>
      <div className="hlp-visual-row">
        <div className="hlp-visual-card">
          <div className="hlp-visual-icon">☰</div>
          <b>Kenar Çubuğu</b>
          <span>Tüm bölümlere buradan geçilir. Dar ekranda hamburger menü ile açılır.</span>
        </div>
        <div className="hlp-visual-card">
          <div className="hlp-visual-icon">🔎</div>
          <b>Kontak Arama</b>
          <span>Her ekranın üstünde durur — TC veya isimle anında müşteri bulun.</span>
        </div>
        <div className="hlp-visual-card">
          <div className="hlp-visual-icon">🔔</div>
          <b>Bildirim Zili</b>
          <span>Bitişi yaklaşan işleri hatırlatır, e-posta ile de gelir.</span>
        </div>
      </div>
      <p className="hlp-hint">
        💡 Üst bardaki <b>Geri</b> butonu ve telefonunuzun/tarayıcınızın geri tuşu her zaman aynı
        yere götürür — panelden dışarı atmaz, bir önceki ekrana döner.
      </p>
    </>
  );
}

function SectionUretim() {
  return (
    <>
      <h2>📁 Üretim Listesi</h2>
      <p>
        Üretim Listesi, poliçelerinizin ay ay tutulduğu ana tablodur. Bir ay kartına tıklayınca o
        ayın kayıtları açılır; arama kutusu, durum filtresi ve tür filtresi ile daraltabilirsiniz.
      </p>
      <ol className="hlp-steps">
        <li><b>Yeni kayıt:</b> Ay ekranında “＋ Yeni Kayıt” ile tek tek eklersiniz — Hesap Adı, Bitiş
          Tarihi, Poliçe Türü, Sigorta Şirketi zorunlu; TC veya Vergi No’dan en az biri gerekir.</li>
        <li><b>Toplu ekleme:</b> “📥 Excel Yükle &amp; Aktar” ile çok sayıda poliçeyi tek seferde
          içeri alırsınız — <b>bkz. Excel Formatı bölümü, sütun adları birebir uymalı.</b></li>
        <li><b>Durum güncelleme:</b> Kayıtları seçip toplu durum değiştirebilir (ör. hepsini
          “Poliçelendirildi” yapabilir) ya da tek tek düzenleyebilirsiniz.</li>
        <li><b>Dışarı aktarma:</b> “📤 Excel Olarak Dışarı Aktar” tüm kayıtları Excel’e döker —
          yedek almak veya başka bir yerde işlemek için kullanılır.</li>
      </ol>
      <p className="hlp-hint">
        💡 <b>İptal</b> ve <b>Yapılmayacak</b> durumundaki poliçeler Cari Hesap’ta prim olarak
        tahakkuk ETMEZ; sadece o poliçeye bağlı tahsilat/iade gibi hareketler bakiyeye girer.
      </p>
    </>
  );
}

function SectionExcel() {
  return (
    <>
      <h2>📊 Excel Formatı <span className="hlp-badge hlp-badge-req">Çok Önemli</span></h2>
      <div className="hlp-warn">
        ⚠️ <b>Sistem her Excel sütununu kabul etmez.</b> Yalnızca aşağıdaki tablodaki başlıklarla
        birebir (harf büyüklüğü fark etmez ama yazım aynı olmalı) eşleşen sütunlar içeri aktarılır.
        Tanınmayan bir başlık <b>hata vermez, sessizce atlanır</b> — yani “yükledim ama bir alan
        boş geldi” şikayetinin en sık sebebi budur. Dosyayı hazırlarken mutlaka bu başlıkları
        kullanın.
      </div>

      <p>Örnek bir başlık satırı şöyle görünmelidir:</p>
      <ExcelHeaderMock />

      <h3 className="hlp-sub">Tanınan Sütunlar</h3>
      <div className="hlp-table-wrap">
        <table className="hlp-table">
          <thead>
            <tr><th>Excel’deki Başlık</th><th>Sisteme İşlenen Alan</th><th>Durum</th><th>Not</th></tr>
          </thead>
          <tbody>
            {EXCEL_COLUMNS.map((c) => (
              <tr key={c.field}>
                <td>{c.heads.map((h) => <code key={h} className="hlp-code">{h}</code>)}</td>
                <td>{c.field}</td>
                <td><ReqBadge required={c.required} /></td>
                <td className="hlp-muted">{c.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="hlp-sub">Bilinmesi Gerekenler</h3>
      <ul className="hlp-list">
        <li><b>Tarih:</b> “Bitiş Tarihi” sütunu Excel’de gerçek bir tarih hücresi olmalı (yazı
          olarak yazılmış tarih hatalı okunabilir). Sadece bu sütun tarih olarak çevrilir.</li>
        <li><b>TC / Vergi No:</b> Hücrede boşluk, tire gibi karakterler olsa bile sistem otomatik
          temizler ve yalnızca rakamları kaydeder.</li>
        <li><b>Hesap Adı:</b> Otomatik olarak BÜYÜK harfe çevrilir — kontak eşleştirmesi buna
          dayandığı için isim yazımını değiştirmenize gerek yoktur.</li>
        <li><b>Fazladan sütunlar:</b> Listede olmayan bir sütun (ör. “Açıklama 2”) dosyada
          bulunabilir, sorun çıkarmaz — sadece o sütun içeri aktarılmaz.</li>
        <li><b>Satır sınırı:</b> Tek seferde aktarılabilecek satır sayısı sınırlıdır (varsayılan
          20.000). Daha büyük dosyaları bölerek yükleyin.</li>
        <li><b>Durum boşsa:</b> “Sistem Durum” sütunu boş bırakılırsa kayıt otomatik
          “Çalışılmadı” durumunda başlar.</li>
      </ul>

      <p className="hlp-hint">
        💡 Emin değilseniz önce “📤 Excel Olarak Dışarı Aktar” ile mevcut kayıtlarınızı indirip
        başlık satırını örnek alın — böylece hangi sütun adının kabul edildiğini birebir görürsünüz.
      </p>
    </>
  );
}

function SectionKontak() {
  return (
    <>
      <h2>🔎 Kontak Arama &amp; Müşteri 360</h2>
      <p>
        Her ekranın üstünde duran “🔎 Kontak Arama” butonu, TC kimlik no veya isimle anında müşteri
        bulmanızı sağlar. Bir müşteriye tıkladığınızda <b>Müşteri 360</b> açılır: o kişinin tüm
        poliçeleri, görüşme notları ve cari hesabı tek ekranda görünür.
      </p>
      <p>
        Müşteri kimliği, veritabanında ayrı bir “müşteri” tablosu olmadığı için <b>TC + İsim</b>
        kombinasyonundan otomatik türetilir — aynı müşteri farklı poliçelerde her zaman aynı
        kişi olarak eşleşir.
      </p>
    </>
  );
}

function SectionCari() {
  return (
    <>
      <h2>💳 Cari Hesap</h2>
      <p>
        Müşteri 360 içindeki <b>Hesap</b> sekmesi, müşterinin acenteye olan borç/alacak durumunu
        gösterir. Poliçe primleri (brüt tutar) otomatik borç olarak işlenir; tahsilat, iade,
        ek prim veya masraf gibi hareketleri siz elle eklersiniz.
      </p>
      <ul className="hlp-list">
        <li><b>Bakiye pozitifse</b> müşteri size borçludur.</li>
        <li><b>Bakiye negatifse</b> müşterinin alacağı vardır.</li>
        <li><b>İptal / Yapılmayacak</b> poliçeler için prim tahakkuk etmez, ama o poliçeye bağlı
          bir iade varsa yine bakiyeye yansır.</li>
      </ul>
    </>
  );
}

function SectionTakip() {
  return (
    <>
      <h2>🔔 Takip Edilen İşler</h2>
      <p>
        Henüz poliçeleşmemiş veya yakından takip etmek istediğiniz her iş buraya eklenebilir.
        Zorunlu alan yalnızca <b>Müşteri Adı</b> ve <b>Poliçe Bitiş Tarihi</b>’dir — elinizdeki
        bilgi kadarıyla kaydedip devam edebilirsiniz.
      </p>
      <p>
        Bir iş için seçtiğiniz gün sayısı (7/15/30/45/60/90) kadar bitişe kalınca hem üst bardaki
        <b> bildirim zili</b> hem de acentedeki tüm çalışanlara tek bir özet e-posta gönderilir.
        Kalan gün hesabı her zaman sunucuda yapılır; ekranda ve e-postada gördüğünüz sayı asla
        birbirinden farklı olmaz.
      </p>
    </>
  );
}

function SectionGrafikler() {
  return (
    <>
      <h2>📈 Grafikler</h2>
      <p>
        Portföyünüzün aylık üretimini, yenilenme oranını, prim artışını ve tür/şirket/prodüktör
        kırılımlarını gösteren analiz ekranıdır. Ekranın altındaki “Nasıl hesaplanıyor?” bölümü
        her ölçütün tam tanımını açıklar.
      </p>
      <p className="hlp-hint">
        💡 Aynı ürünün Excel’de “410”, “TRAFİK”, “TRAFİK SİGORTA POLİÇESİ” gibi farklı yazılması
        grafikleri bölmesin diye <b>Ayarlar → Poliçe Türleri → Kategoriler</b>’den bunları tek
        kategoride toplayabilirsiniz.
      </p>
    </>
  );
}

function SectionUygulamalar() {
  return (
    <>
      <h2>🧰 Uygulamalar</h2>
      <p>Tarayıcı içinde çalışan, sunucuya hiçbir dosya göndermeyen yardımcı araçlardır:</p>
      <div className="hlp-visual-row">
        <div className="hlp-visual-card">
          <div className="hlp-visual-icon">🪪</div>
          <b>Ruhsat Okuyucu</b>
          <span>Ruhsat fotoğrafından/QR’ından bilgileri otomatik okur.</span>
        </div>
        <div className="hlp-visual-card">
          <div className="hlp-visual-icon">📄</div>
          <b>Dış Poliçe Takip</b>
          <span>Başka acentede/şirkette duran poliçeleri PDF’ten çıkarıp izler.</span>
        </div>
        <div className="hlp-visual-card">
          <div className="hlp-visual-icon">📊</div>
          <b>Polisoft Karşılaştırması</b>
          <span>Şirket üretim Excel’i ile Polisoft üretimini poliçe no’ya göre karşılaştırır.</span>
        </div>
      </div>
    </>
  );
}

function SectionDestek() {
  return (
    <>
      <h2>✉️ Destek</h2>
      <p>
        Bir sorunla karşılaşırsanız veya panelle ilgili bir isteğiniz olursa aşağıdaki adresten
        bize ulaşabilirsiniz:
      </p>
      <a className="hlp-email-box" href="mailto:support@zenithpeak.com.tr">
        <span className="hlp-visual-icon">✉️</span>
        <span>
          <b>support@zenithpeak.com.tr</b>
          <span className="hlp-muted">Destek ve geri bildirim için</span>
        </span>
      </a>
      <p className="hlp-hint">
        💡 Aynı adrese <b>Ayarlar → Yardım</b> sayfasından da ulaşabilirsiniz.
      </p>
    </>
  );
}

const CONTENT = {
  genel: SectionGenel,
  uretim: SectionUretim,
  excel: SectionExcel,
  kontak: SectionKontak,
  cari: SectionCari,
  takip: SectionTakip,
  grafikler: SectionGrafikler,
  uygulamalar: SectionUygulamalar,
  destek: SectionDestek,
};

export default function HelpGuide({ onClose, initialSection = 'genel' }) {
  const [active, setActive] = useState(initialSection);
  const Active = CONTENT[active] || SectionGenel;

  return (
    <div className="ks-overlay hlp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ks-modal hlp-modal" role="dialog" aria-modal="true" aria-label="Nasıl Kullanılır?">
        <div className="ks-head">
          <strong>❓ Nasıl Kullanılır?</strong>
          <button className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
        </div>
        <div className="hlp-body">
          <nav className="hlp-nav">
            {SECTIONS.map((s) => (
              <button key={s.key} className={`hlp-nav-btn ${active === s.key ? 'active' : ''}`}
                onClick={() => setActive(s.key)}>
                <span className="hlp-nav-icon">{s.icon}</span>
                <span className="hlp-nav-title">{s.title}</span>
                {s.badge && <span className="hlp-nav-badge">{s.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="hlp-content">
            <Active />
          </div>
        </div>
      </div>
    </div>
  );
}
