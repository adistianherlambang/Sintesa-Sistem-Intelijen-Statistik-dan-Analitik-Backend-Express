# Dokumentasi `api/dashboard/overview.js`

## Ringkasan

File ini mengekspor `router` Express untuk beberapa endpoint dashboard BPS.
Endpoint utama mengembalikan data inflasi, IHK, komoditas, dan dokumentasi status umum dari model `APIDataBPS`.

## Endpoint

### POST `/dashboard/inflasi`

- Body JSON: `{ "kota": "Nama Kota" }`
- Mengambil dokumen BPS untuk `var.val = 1`
- Mengembalikan:
  - `kota`
  - `var` (objek variabel)
  - `regionVal`
  - `total` jumlah entri data
  - `data` array data terurut berdasarkan key
  - `dashboard.now` nilai terbaru
  - `dashboard.compare` selisih nilai terbaru dengan sebelumnya
  - `yoy` array data YoY terurut

### GET `/dashboard/inflasi`

- Menampilkan dokumen BPS lengkap untuk `var.val = 1`
- Response: `{ doc }`

### POST `/dashboard/ihk`

- Body JSON: `{ "kota": "Nama Kota" }`
- Mengambil dokumen BPS untuk `var.val = 2245`
- Struktur response sama dengan endpoint inflasi, tetapi menggunakan prefix `2` pada key

### GET `/dashboard/ihk`

- Menampilkan dokumen BPS lengkap untuk `var.val = 2245`
- Response: `{ doc }`

### GET `/dashboard/inflasi/komoditas` (alias: `/dashboard/komoditas`)

- Mengambil dokumen BPS untuk `var.val = 2223` (Inflasi MoM Komoditas Makanan, dkk)
- Response: dokumen langsung dari database

### POST `/dashboard/inflasi/komoditas` (alias: `/dashboard/komoditas`)

- Body JSON: `{ "kota": "Nama Kota" }`
- Menggunakan daftar `varKelompokIHK` (var: 2223 - 2233) untuk membangun:
  - `hierarki`
  - `prevYear` / `yoy`
  - `prev2Year`
  - `biggest`
  - `topmom`, `topyoy`, `topsubmom`, `topsubyoy`
- Response berisi struktur data inflasi komoditas untuk kota yang dipilih

### POST `/dashboard/inflasi/komoditas/yoy` (alias: `/dashboard/komoditas/yoy`)
- Mengambil data inflasi komoditas YoY (var: 2250 - 2260)

### POST `/dashboard/inflasi/komoditas/ytd` (alias: `/dashboard/komoditas/ytd`)
- Mengambil data inflasi komoditas YtD (var: 2234 - 2244)

### GET `/dashboard/ihk/komoditas`

- Mengambil dokumen BPS untuk `var.val = 2212` (IHK Komoditas Makanan, dkk)
- Response: dokumen langsung dari database

### POST `/dashboard/ihk/komoditas`

- Body JSON: `{ "kota": "Nama Kota" }`
- Menggunakan daftar `varKelompokIHK` (ihk: 2212 - 2222) untuk membangun struktur IHK per kelompok komoditas dan sub-komoditas
- Response berisi struktur data hierarki IHK komoditas untuk kota yang dipilih

### POST `/dashboard/testapi`

- Memanggil API eksternal BPS menggunakan `fetch`
- Response adalah JSON apa pun dari endpoint BPS

### POST `/dashboard/test`

- Saat ini hanya mencari dokumen `var.val = 2223`
- Tidak mengembalikan data tambahan saat ini

### GET `/dashboard/`

- Mengambil semua dokumen dari collection `APIDataBPS`
- Response: `{ doc }`

## Komponen utama

- `sort(itemSorted)`
  - Mengurutkan array atau objek menurut nilai numeric pada key
- `getLastTwoValues(sorted)`
  - Mengambil nilai terakhir dan selisih terhadap nilai sebelumnya
- `buildFilteredKeyValue(documentSection, regionVal, prefix, yearFilter, monthFilter)`
  - Membangun array key-value berdasarkan filter region, prefix, dan tahun/bulan
- `buildResponseWithDashboard(...)`
  - Menyatukan response akhir dengan `dashboard` dan `yoy`

## Catatan

- `month`, `year`, dan `yoy` digunakan khusus untuk endpoint IHK.
- Struktur `datacontent` dan `yoy` diasumsikan menggunakan key yang memiliki format khusus berdasarkan region, var, turvar, tahun, dan bulan.

## Struktur API BPS

Format key pada data BPS mengikuti pola berikut:

`"34 2233 1601 126 2"`

Setiap bagian merepresentasikan:

- `kota`
- `var`
- `turvar`
- `tahun`
- `bulan`
