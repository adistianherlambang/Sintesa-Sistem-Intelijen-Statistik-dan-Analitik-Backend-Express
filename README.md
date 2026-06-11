# Sintesa - Sistem Intelijen Statistik dan Analitik - Backend

## Kredensial User Dummy untuk Testing

Untuk mempermudah pengujian otentikasi dan alur pembatasan wilayah (1 user = 1 wilayah), gunakan akun pengujian berikut:

- **Email**: `admin@bps.go.id`
- **Kata Sandi**: `password123`
- **Wilayah Tugas**: `Kota Metro` (ID: `metro`)

---

## Struktur Database & Validasi Wilayah

- Pilihan kota disimpan dalam field `location` pada schema `User`.
- Sistem membatasi pendaftaran wilayah baru sehingga 1 wilayah (ID unik) hanya dapat diklaim oleh 1 user instansi.
