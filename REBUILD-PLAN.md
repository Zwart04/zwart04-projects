# Rencana pembangunan ulang Zwart04 — penggabungan produk utuh

Status: implementasi berlangsung. Dokumen ini bukan laporan selesai.

## Batas cakupan

- 49 repo publik asal, termasuk daily-apps yang baru diizinkan.
- 11 produk utama + 1 repo katalog/infrastruktur.
- Repo private, agenmini, zwartos, ZwartGuard, dan rakaat-counter dikecualikan.
- Tidak ada navbar pindah ke varian aplikasi, iframe aplikasi lama, atau direktori apps/ berisi produk duplikat.
- Repo lama dihapus hanya setelah backup terbaru, sumber pengganti, backend, fitur inti, CI, dan deployment berhasil diverifikasi.

## Arsitektur

React/Vite untuk frontend responsif. Cloudflare Workers untuk API nyata dan static assets. Satu D1 baru khusus rebuild untuk database, dengan isolasi product + workspace dan role owner/editor/viewer. Database Cloudflare yang sudah ada tidak diubah. Workers AI digunakan dengan batas aplikasi agar tidak melampaui anggaran gratis; tidak ada aktivasi paket berbayar. Media diproses di browser, metadata proyek di D1; lokasi penyimpanan berkas dijelaskan di UI.

## Alur akun yang berlaku di setiap produk

Registrasi email + password → kode pemulihan sekali tampil → workspace → onboarding → dashboard. Login memverifikasi hash password di server, session cookie HttpOnly/Secure, logout mencabut session. Pemulihan memakai kode pemulihan, bukan form login palsu. Akun dapat dipakai lintas produk; data tetap terpisah berdasarkan produk dan workspace. Workspace memiliki undangan anggota serta peran yang diperiksa server.

## Urutan pekerjaan dan gerbang kelulusan

1. Snapshot riwayat terbaru seluruh repo yang diizinkan ke SATU backup, verifikasi checksum, simpan di satu release GitHub.
2. Bangun schema D1, migrasi, API auth, role, audit, validasi, pembatasan request, dan pengujian isolasi akun/workspace.
3. Bangun shell desain: landing, login/register/recovery, onboarding, sidebar modul, pencarian, detail, form, loading, error, empty state; cek desktop dan mobile.
4. Bangun setiap produk sesuai alur di bawah. Modul sejenis memakai model data dan transaksi yang sama; bukan tautan ke aplikasi lama.
5. Uji fitur inti dengan data sintetis: CRUD, persistensi server, akun salah, session dicabut, akses lintas akun ditolak, validasi data, workflow/idempotensi, ekspor dan pemulihan.
6. Deploy seluruh produk ke subdomain final, periksa API dan alur browser, jalankan CI dari checkout baru.
7. Hapus repo duplikat yang penggantinya sudah lulus. Token saat ini belum memiliki delete_repo; akses ini diselesaikan melalui autentikasi resmi GitHub pada tahap penghapusan.
8. Simpan source + dokumentasi + backup final di GitHub, verifikasi hasil, lalu bersihkan HANYA folder kerja rebuild di laptop; folder proyek lain tidak diubah.

## Produk dan fitur

### DailyOS — daily-apps

Satu workspace pribadi untuk perencanaan, kebiasaan, dokumen dan alat kerja sehari-hari.

Repo yang disatukan: `daily-apps`, `habitflow`, `habitgrid`, `routineflow`, `hearth-os`, `tripforge`.

Modul: Hari ini & kalender, Kebiasaan & check-in, Rutinitas bertahap, Tugas & target, Catatan & anggaran, Rencana perjalanan, Surat terjadwal, Form builder, Editor HTML, Tema dari gambar, Pembersihan data, 12 utilitas developer, Kata Kilat, Kurs live, CLI terpadu.

Alur: Daftar → simpan kode pemulihan → buat workspace → rencanakan hari → check-in/tugas → laporan progres. Dokumen dan hasil tool dapat disimpan sebagai bagian workspace.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### DagangHub — daganghub

Sistem operasional usaha dari produk dan pelanggan sampai pesanan, stok, invoice, pemasaran dan pengiriman.

Repo yang disatukan: `daganghub`, `rosari-commerce`, `warungrosari`, `waconvert`, `wahagenius-crm`, `ledger`, `ledgerflow`, `invensight`, `priceforge`, `menumaster`, `motopart`, `attribution-hub`, `resi-flow`.

Modul: Produk & varian, Pelanggan & CRM, Pemasok, Pesanan, Stok & mutasi, Invoice & pembayaran, Pengeluaran, Harga & margin, Menu & bundel, Kampanye & ROAS, Pengiriman, Laporan & audit.

Alur: Produk + pelanggan → pesanan draft → konfirmasi dengan pemeriksaan stok atomik → invoice → pembayaran → pengiriman → laporan; pembatalan mengembalikan stok tepat sekali.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### RenderForge Studio — renderforge

Studio kreatif dengan satu proyek, asset library, timeline, audio dan paket publikasi.

Repo yang disatukan: `renderforge`, `mediaforge`, `clipforge`, `clipforge-ai`, `neurotone`, `audiomind-studio`, `socsynth-studio`, `socsynth-studio-new`, `zwart-2026-08-31-socsynth-studio`, `podforge`, `voiceforge-studio`, `moodcanvas`.

Modul: Proyek, Asset library, Storyboard, Timeline video, Editor audio WAV, Sintesis suara, Moodboard & kanvas, Naskah podcast, Rencana publikasi, Template & export.

Alur: Buat proyek → impor aset → susun storyboard/timeline → edit audio atau visual → preview → ekspor media dan simpan catatan versi di proyek yang sama.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### TutorMind Academy — tutormind

Platform belajar dan pembuatan kursus dengan materi, latihan, penilaian dan progres nyata.

Repo yang disatukan: `tutormind`, `courseforge`, `inventa`.

Modul: Kursus, Modul & materi, Pendaftaran belajar, Sesi belajar, Flashcard, Kuis & penilaian, Tugas, Catatan belajar, Progres, Tutor AI.

Alur: Buat kursus → materi → belajar → latihan flashcard/kuis → kirim jawaban → penilaian dari kunci jawaban → progres; bantuan AI dipanggil dari backend.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### Servora Operations — servora

Operasi layanan dengan pemesanan, teknisi, pekerjaan lapangan dan kendaraan dalam satu jadwal.

Repo yang disatukan: `servora`, `bookflow`, `fieldroute-os`, `fleetmile`.

Modul: Pelanggan, Layanan, Booking, Pekerjaan, Teknisi, Kendaraan, Rute & jarak, Checklist, Biaya, Jadwal & laporan.

Alur: Pelanggan → booking tanpa bentrok → pekerjaan + teknisi/kendaraan → checklist lapangan → selesai → biaya/jarak dan laporan operasional.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### AquaPure Field Intelligence — aquapure

Workspace lapangan untuk pengukuran air, pertanian, input, hasil panen dan catatan emisi.

Repo yang disatukan: `aquapure`, `farmlog`, `carbontrack`.

Modul: Lokasi, Sensor, Sampel air, Ambang & alert, Tanaman, Kegiatan lapangan, Input pertanian, Panen, Aktivitas emisi, Laporan & ingestion API.

Alur: Lokasi → pengukuran manual atau API sensor → evaluasi ambang milik pengguna → alert → tindakan lapangan; kegiatan dan panen dikaitkan ke lokasi, emisi dihitung dari faktor yang dicatat.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### ClinicOS — clinic-os

Administrasi klinik dengan rekam kegiatan, jadwal, stok dan tagihan; akses data berdasarkan workspace.

Repo yang disatukan: `clinic-os`.

Modul: Pasien, Janji temu, Kunjungan, Catatan & resep, Staf, Ruangan, Persediaan, Tagihan, Rujukan, Tindak lanjut.

Alur: Pasien → janji temu tanpa bentrok → kunjungan → catatan/resep → tagihan → tindak lanjut; pemisahan akses antar-workspace diuji.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### Garuda Legal Workspace — legalbot-garuda

Manajemen perkara, dokumen, tenggat, waktu kerja dan referensi dalam satu workspace.

Repo yang disatukan: `legalbot-garuda`, `lawbot`, `legalbotgaruda`.

Modul: Klien, Perkara, Dokumen, Tenggat, Tugas, Catatan waktu, Invoice, Klausul & template, Referensi, Asisten AI.

Alur: Klien → perkara → dokumen & tenggat → pekerjaan/catatan waktu → invoice → arsip perkara; sumber referensi disimpan eksplisit.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### CodeForge Workspace — codeforgeme

Workspace pengembangan proyek dengan berkas, pengujian browser, paket ekspor dan alat diagnosis.

Repo yang disatukan: `codeforgeme`.

Modul: Proyek, Editor berkas, Task board, Snippet, Preview tersandbox, Pengujian JavaScript, Rilis ZIP, Environment checklist, Dokumentasi, Asisten kode AI.

Alur: Buat proyek → tambah/edit berkas → preview terisolasi → jalankan pengujian → perbaiki → ekspor paket proyek dan catatan rilis.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### GridCraft Engine — gridcraft

Editor game 2D dengan level, tile, entity, shader dan playtest di dalam proyek yang sama.

Repo yang disatukan: `gridcraft`, `shaderforge`.

Modul: Proyek, Editor level, Layer & tile, Entity, Asset library, Shader GLSL, Playtest, Undo/redo, Export JSON/PNG, Versi proyek.

Alur: Proyek → gambar level → atur entity/layer → shader → playtest dengan collision → simpan versi → ekspor JSON/PNG.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

### StockGenie Portfolio — stockgenie

Workspace pemantauan pasar, portofolio dan jurnal keputusan dengan harga publik nyata.

Repo yang disatukan: `stockgenie`.

Modul: Watchlist, Harga live, Kepemilikan, Transaksi, Valuasi & P/L, Alert harga, Jurnal, Riset, Snapshot, Export laporan.

Alur: Tambah aset → catat transaksi/biaya → feed harga aktual → hitung kepemilikan dan P/L → alert + jurnal → snapshot dan ekspor; aplikasi tidak mengeksekusi perdagangan.

Kriteria: satu UI dan satu workspace; semua operasi data melalui API berotorisasi; proses utama, validasi, persistensi dan ekspor diuji.

## Backend gratis dan batas praktis

Cloudflare D1 dan Workers memiliki kuota gratis; static assets tidak memerlukan server berbayar. AI, file besar, email pengiriman otomatis, integrasi WhatsApp, sensor fisik dan feed pihak ketiga tidak boleh diklaim aktif tanpa koneksi yang terbukti. Tidak ada biaya atau upgrade paket yang diaktifkan dalam pekerjaan ini. Kebutuhan yang belum dapat diaktifkan harus disebut secara konkret di laporan, bukan diganti simulasi sukses.

Referensi: https://developers.cloudflare.com/d1/platform/limits/ ; https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ ; https://developers.cloudflare.com/workers-ai/platform/pricing/
