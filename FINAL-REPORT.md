# Hasil perombakan repositori Zwart04

49 repositori sumber publik digabung berdasarkan konsep menjadi 11 produk, ditambah satu repositori katalog dan backend. **38 duplikat dihapus**, bukan diarsipkan. Semua riwayat Git tersimpan dalam [satu backup pemulihan](https://github.com/Zwart04/zwart04-projects/releases/tag/unified-rebuild-backup).

[Katalog aplikasi online](https://projects-app.zwart.qzz.io/) · [Rencana penggabungan](REBUILD-PLAN.md) · [Arsitektur backend](docs/BACKEND.md)

| Produk | Fungsi | Modul |
|---|---|---:|
| [DailyOS](https://daily-apps-app.zwart.qzz.io/) | Satu workspace pribadi untuk perencanaan, kebiasaan, dokumen dan alat kerja sehari-hari. | 20 |
| [DagangHub](https://daganghub-app.zwart.qzz.io/) | Sistem operasional usaha dari produk dan pelanggan sampai pesanan, stok, invoice, pemasaran dan pengiriman. | 13 |
| [RenderForge Studio](https://renderforge-app.zwart.qzz.io/) | Studio kreatif dengan satu proyek, asset library, timeline, audio dan paket publikasi. | 11 |
| [TutorMind Academy](https://tutormind-app.zwart.qzz.io/) | Platform belajar dan pembuatan kursus dengan materi, latihan, penilaian dan progres nyata. | 12 |
| [Servora Operations](https://servora-app.zwart.qzz.io/) | Operasi layanan dengan pemesanan, teknisi, pekerjaan lapangan dan kendaraan dalam satu jadwal. | 12 |
| [AquaPure Field Intelligence](https://aquapure-app.zwart.qzz.io/) | Workspace lapangan untuk pengukuran air, pertanian, input, hasil panen dan catatan emisi. | 13 |
| [ClinicOS](https://clinic-os-app.zwart.qzz.io/) | Administrasi klinik dengan rekam kegiatan, jadwal, stok dan tagihan; akses data berdasarkan workspace. | 12 |
| [Garuda Legal Workspace](https://legalbot-garuda-app.zwart.qzz.io/) | Manajemen perkara, dokumen, tenggat, waktu kerja dan referensi dalam satu workspace. | 11 |
| [CodeForge Workspace](https://codeforgeme-app.zwart.qzz.io/) | Workspace pengembangan proyek dengan berkas, pengujian browser, paket ekspor dan alat diagnosis. | 12 |
| [GridCraft Engine](https://gridcraft-app.zwart.qzz.io/) | Editor game 2D dengan level, tile, entity, shader dan playtest di dalam proyek yang sama. | 9 |
| [StockGenie Portfolio](https://stockgenie-app.zwart.qzz.io/) | Workspace pemantauan pasar, portofolio dan jurnal keputusan dengan harga publik nyata. | 9 |

## Perilaku produk

Setiap produk memiliki satu navigasi, akun sungguhan, kode pemulihan, workspace kosong, hak akses owner/editor/viewer, undangan, data D1, audit, pencarian, ekspor dan pemulihan record yang dihapus. Antarmuka responsif dan menyediakan mode gelap. Modul bekerja menggunakan data pengguna; tidak ada seed, login simulasi, angka dashboard fiktif, atau fallback provider yang mengaku berhasil.

Alur khusus mencakup check-in dan rutinitas, pesanan/stok/invoice, formulir publik dengan respons tersimpan, kuis dinilai di server, ingest sensor dengan API key, editor audio/video/gambar, JavaScript sandbox, level editor/playtest, shader WebGL, kurs dan harga Coinbase serta Workers AI sungguhan.

## Bukti verifikasi

- 14 pengujian Node dan 3 pengujian CLI Python lulus.
- 105 pemeriksaan integrasi pada database Cloudflare pengujian terpisah lulus: penyimpanan/baca modul, ekspor/summary, formulir publik dan provider nyata.
- CI seluruh 12 repositori lulus pada commit sumber terbit; HTTPS, aset hasil build dan backend 11 produk diperiksa.
- 38 URL lama mengembalikan HTTP 301 ke produk hasil penggabungan.
- Seluruh 50 Git bundle berhasil diklon ulang; commit terbaru dan head dalam bundle sebelum perombakan tersedia. Checksum asset backup GitHub cocok.
- Browser: desktop dan viewport 390px diperiksa; audio trim 1 detik, WebM trim 0,987 detik, crop gambar 113x200, eksekusi JS dengan jaringan diblokir, penghentian loop setelah 3 detik, render/error GLSL, serta langkah rutinitas dan kontrol level diperiksa.

Lihat VERIFICATION.json, public-verification.json, native-verification.json, alias-verification.json, deletion-results.json dan restore-verification.json untuk batas serta bukti pemeriksaan. Tidak setiap kombinasi perangkat/codec atau semua urutan UI diuji. Observer unduhan browser panel timeout; berkas media hasil render berhasil didekode sebagai preview, tetapi penyimpanan Blob ke disk belum diverifikasi secara independen.

## Batas layanan yang terlihat

Cloudflare Workers/D1/AI menggunakan alokasi gratis dengan batas kuota; tidak ada upgrade berbayar yang diaktifkan. AI maksimal 5 panggilan per akun dan 40 secara global per hari. Error provider ditampilkan. Berkas media berada di IndexedDB browser pengunggah, metadata di D1; byte berkas belum merupakan penyimpanan cloud lintas perangkat. Voice memakai suara sistem untuk pembacaan, bukan ekspor TTS. Python diedit dan diekspor, bukan dijalankan di browser. Harga crypto berasal dari Coinbase BTC/ETH/SOL dan tidak terhubung broker. Invoice/payment adalah catatan internal, bukan gateway pembayaran. Formulir, booking dan pemberitahuan aplikasi tidak mengirim email/SMS yang belum terhubung.

## Batas perubahan dan pembersihan

Hanya repositori publik milik Zwart04 yang diubah. Semua private serta agenmini, zwartos, ZwartGuard, rakaat-counter dikecualikan. daily-apps masuk setelah izin tambahan pemilik. Sumber aplikasi lama berada dalam backup, bukan pilihan launcher di produk baru.

36 Worker lama/pengujian dan database pengujian sudah dihapus; backend produksi dan database lain dipertahankan. Inventaris akhir: 16 repo publik (11 produk, 1 katalog, 4 dilindungi) serta 11 repo private tetap tersedia. Folder kerja khusus perombakan di laptop dibersihkan setelah source, laporan dan backup terverifikasi di GitHub. Folder proyek pengguna di luar area kerja ini tidak masuk pembersihan.
