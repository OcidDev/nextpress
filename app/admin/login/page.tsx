import Link from 'next/link'
import { LoginForm } from '@/components/admin/LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const configured = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET)

  let noticeMessage = ''
  if (params.notice === 'email_updated') {
    noticeMessage = 'Email berhasil diperbarui. Silakan masuk kembali dengan email baru Anda.'
  } else if (params.notice === 'password_updated') {
    noticeMessage = 'Kata sandi berhasil diperbarui. Silakan masuk kembali dengan kata sandi baru Anda.'
  } else if (params.notice === 'relogin') {
    noticeMessage = 'Kredensial akun telah diubah. Silakan masuk kembali.'
  }

  return (
    <main className="adminLoginPage">
      <div className="adminLoginIntro">
        <Link href="/" className="loginBrand">
          <span className="adminBrandMark" aria-hidden="true">
            n
          </span>
          NextPress
        </Link>
        <div>
          <span className="loginEyebrow">RUANG UNTUK BERKARYA</span>
          <h1>
            Cerita berikutnya
            <br />
            dimulai di sini.
          </h1>
          <p>Tulis, terbitkan, dan kelola blog Anda dalam satu ruang kerja.</p>
        </div>
        <small>Tempat untuk cerita dan gagasan Anda.</small>
      </div>
      <section className="adminLogin">
        <span className="adminEyebrow">SELAMAT DATANG KEMBALI</span>
        <h2>Masuk ke CMS</h2>
        <p>Gunakan akun Anda untuk melanjutkan.</p>
        {noticeMessage && (
          <p role="status" className="loginNotice">
            {noticeMessage}
          </p>
        )}
        {configured ? (
          <LoginForm />
        ) : (
          <p role="status">
            CMS belum dikonfigurasi. Ikuti penyiapan database dan admin pada README.
          </p>
        )}
        <Link href="/" className="loginBack">
          ← Kembali ke blog
        </Link>
      </section>
    </main>
  )
}
