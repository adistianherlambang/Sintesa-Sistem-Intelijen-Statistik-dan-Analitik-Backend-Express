# Dokumentasi Konsumsi API di React.js

Dokumen ini berisi panduan praktis dan contoh kode untuk mengonsumsi (consume) seluruh endpoint sistem Pengguna, Riwayat Analisis, Langganan, dan Pembayaran (bayar.gg QRIS) dari sisi React.js.

---

## 🛠️ 1. Setup Axios Client (Rekomendasi)

Untuk memudahkan penanganan token autentikasi secara otomatis pada setiap request, buat berkas instance Axios khusus (misalnya `src/api/client.js`):

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Sesuaikan dengan PORT backend Anda
});

// Interceptor untuk otomatis menyertakan Bearer Token jika user sudah login
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
```

---

## 🔑 2. Autentikasi & Profil Pengguna

### A. Registrasi Akun Baru (Termasuk Pilih Kota)
Digunakan saat pendaftaran pengguna baru. Pilihan kota langsung ditentukan di awal.

```javascript
import api from './client';

// Contoh memanggil di komponen Register.jsx
const handleRegister = async (email, password, name, kota) => {
  try {
    const response = await api.post('/users/register', {
      email,
      password,
      name,
      kota // Contoh: "Bandung" atau "aceh-tengah"
    });
    console.log('Registrasi Sukses:', response.data.message);
    return response.data.user;
  } catch (error) {
    console.error('Registrasi Gagal:', error.response?.data?.message || error.message);
  }
};
```

### B. Login Akun (Menyimpan Token & Info User)
Setelah login sukses, token disimpan ke `localStorage`.

```javascript
import api from './client';

const handleLogin = async (email, password) => {
  try {
    const response = await api.post('/users/login', { email, password });
    const { token, user } = response.data;
    
    // Simpan token untuk session auth
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    console.log('Login Sukses, lokasi aktif:', user.location.name);
    return { token, user };
  } catch (error) {
    console.error('Login Gagal:', error.response?.data?.message || error.message);
  }
};
```

### C. Mengambil Informasi Profil Pengguna
```javascript
const fetchProfile = async () => {
  try {
    const response = await api.get('/users/profile');
    return response.data.user; // Mengembalikan data user beserta lokasi aktifnya
  } catch (error) {
    console.error('Gagal mengambil profil:', error.response?.data?.message);
  }
};
```

### D. Mengubah Profil (Nama / Foto)
```javascript
const updateProfile = async (name, avatarUrl) => {
  try {
    const response = await api.post('/users/profile', {
      name,
      avatar: avatarUrl
    });
    console.log('Profil Diperbarui:', response.data.user);
    return response.data.user;
  } catch (error) {
    console.error('Gagal memperbarui profil:', error.response?.data?.message);
  }
};
```

---

## 📜 3. Log Aktivitas User

Mengambil daftar log riwayat aktivitas yang dilakukan pengguna.

```javascript
const fetchActivities = async () => {
  try {
    const response = await api.get('/users/activities');
    return response.data; // Mengembalikan array aktivitas
  } catch (error) {
    console.error('Gagal memuat log aktivitas:', error.response?.data?.message);
  }
};
```

---

## 📂 4. Riwayat Analisis & Download File IDML

### A. Simpan Uji Coba Analisis (Upload File IDML via Base64)
Di React, file yang dipilih dari `<input type="file" />` harus diubah ke format Base64 terlebih dahulu sebelum dikirim.

```javascript
import React, { useState } from 'react';
import api from './client';

function UploadAnalysis() {
  const [title, setTitle] = useState('');
  const [periode, setPeriode] = useState('');
  const [file, setFile] = useState(null);

  // Helper untuk membaca file ke Base64
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Hilangkan header data:application/...;base64,
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert('Pilih file IDML terlebih dahulu');

    try {
      const base64File = await toBase64(file);
      const response = await api.post('/users/analysis', {
        title,
        periode,
        fileContent: base64File,
        fileName: file.name
      });
      alert(response.data.message);
    } catch (error) {
      console.error('Gagal menyimpan analisis:', error.response?.data?.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" placeholder="Judul Laporan" onChange={e => setTitle(e.target.value)} />
      <input type="text" placeholder="Periode (ex: April 2026)" onChange={e => setPeriode(e.target.value)} />
      <input type="file" accept=".idml" onChange={e => setFile(e.target.files[0])} />
      <button type="submit">Simpan Analisis</button>
    </form>
  );
}
```

### B. Mengambil Daftar Riwayat Analisis
```javascript
const getAnalysisHistoryList = async () => {
  try {
    const response = await api.get('/users/analysis');
    return response.data; // Array riwayat laporan
  } catch (error) {
    console.error('Gagal mengambil riwayat analisis:', error.response?.data?.message);
  }
};
```

### C. Download File IDML Secara Aman
Menangani download binary stream dan menyimpannya sebagai file `.idml` di peramban (browser) pengguna.

```javascript
const handleDownloadIDML = async (historyId, reportTitle) => {
  try {
    const response = await api.get(`/users/analysis/${historyId}/download`, {
      responseType: 'blob' // Wajib menyertakan blob untuk file binary stream
    });

    // Membuat link unduhan samaran di browser
    const blob = new Blob([response.data], { type: 'application/octet-stream' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `${reportTitle.replace(/\s+/g, '_')}.idml`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error('Gagal mengunduh file:', error.response?.data?.message || error.message);
  }
};
```

---

## 💳 5. Fitur Langganan & Transaksi QRIS bayar.gg

### A. Memulai Pembayaran Upgrade Paket (Dapatkan QRIS)
Menghasilkan rincian pembayaran beserta gambar QRIS dinamis untuk di-scan pengguna.

```javascript
import React, { useState } from 'react';
import api from './client';

function UpgradeSubscription() {
  const [paymentInfo, setPaymentInfo] = useState(null);

  const handlePay = async (planId) => {
    try {
      const response = await api.post('/users/billing/pay', { planId }); // planId: 'premium_monthly'
      
      // Menyimpan data invoice dan QRIS image url
      setPaymentInfo(response.data.payment); 
      console.log('Invoice Dibuat:', response.data.transaction);
    } catch (error) {
      console.error('Gagal inisiasi pembayaran:', error.response?.data?.message);
    }
  };

  return (
    <div>
      <button onClick={() => handlePay('premium_monthly')}>Beli Paket Bulanan (Rp 50.000)</button>
      
      {paymentInfo && (
        <div style={{ marginTop: 20 }}>
          <h3>Scan QRIS untuk Membayar</h3>
          <p>Invoice ID: {paymentInfo.invoiceId}</p>
          <p>Total Nominal: Rp {paymentInfo.finalAmount.toLocaleString('id-ID')}</p>
          
          {/* Tampilkan QR Code */}
          <img src={paymentInfo.qrisImageUrl} alt="QRIS Barcode" style={{ width: 250, height: 250 }} />
          
          <p>
            <a href={paymentInfo.paymentUrl} target="_blank" rel="noreferrer">
              Buka Halaman Pembayaran Utama
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
```

### B. Cek Status Pembayaran (Konfirmasi Pembayaran Sukses)
Gunakan tombol "Cek Status" atau lakukan polling berkala untuk mengetahui apakah QRIS sudah dibayar. Jika lunas, paket langganan user akan otomatis aktif.

```javascript
const handleCheckStatus = async (invoiceId) => {
  try {
    const response = await api.get(`/users/billing/check/${invoiceId}`);
    const { transaction, subscription, message } = response.data;
    
    if (transaction.status === 'paid') {
      alert('Pembayaran Berhasil! Paket langganan Anda kini aktif.');
      console.log('Detail Paket Aktif:', subscription);
    } else {
      alert(message || 'Pembayaran masih pending, silakan selesaikan pembayaran.');
    }
  } catch (error) {
    console.error('Gagal mengecek status pembayaran:', error.response?.data?.message);
  }
};
```

### C. Mengecek Status Masa Aktif & Kuota Langganan Saat Ini
```javascript
const checkSubscriptionStatus = async () => {
  try {
    const response = await api.get('/users/subscription');
    // Response berisi data sisa kuota, status, dan tanggal kadaluwarsa
    console.log('Masa Aktif & Sisa Kuota:', response.data);
    return response.data;
  } catch (error) {
    console.error('Gagal memuat status paket:', error.response?.data?.message);
  }
};
```

### D. Melihat Riwayat Transaksi Billing (Invoices)
```javascript
const getBillingHistory = async () => {
  try {
    const response = await api.get('/users/billing');
    return response.data; // Array invoice pembayaran user
  } catch (error) {
    console.error('Gagal memuat riwayat transaksi:', error.response?.data?.message);
  }
};
```
