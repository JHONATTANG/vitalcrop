'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Leaf, Mail, KeyRound, Loader2, ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import apiClient from '@/lib/api';
import { setCookie } from 'cookies-next';
import toast, { Toaster } from 'react-hot-toast';

// Schema for Email Step
const emailSchema = z.object({
  email: z.string().email('Escribe una dirección de correo válida'),
});
type EmailForm = z.infer<typeof emailSchema>;

// Schema for OTP Step
const optSchema = z.object({
  code: z.string().length(6, 'OTP must be exactly 6 characters'),
});
type OtpForm = z.infer<typeof optSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [storedEmail, setStoredEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Forms
  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(optSchema) });

  const onEmailSubmit = async (data: EmailForm) => {
    setLoading(true);
    try {
      await apiClient.post('/api/auth/request-code', { email: data.email });
      setStoredEmail(data.email);
      setStep('otp');
      toast.success('Código enviado. Revisa tu correo.');
    } catch (error) {
      toast.error('No se pudo enviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const onOtpSubmit = async (data: OtpForm) => {
    setLoading(true);
    try {
      const res = await apiClient.post('/api/auth/verify-code', { 
        email: storedEmail, 
        code: data.code 
      });
      
      const { access_token } = res.data;
      if (access_token) {
        setCookie('jwt', access_token, { maxAge: 60 * 60 * 24 * 7, path: '/' });
        toast.success('Sesión iniciada.');
        router.push('/dashboard');
      } else {
        toast.error('La respuesta del servidor no traía una sesión válida.');
      }
    } catch (error) {
      toast.error('El código no es correcto o ya caducó.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-sm px-4">
      <Toaster position="top-center" toastOptions={{
        style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }
      }} />

      {/* Card */}
      <div className="glass rounded-2xl p-8 shadow-card relative overflow-hidden">
        
        {/* Animated Background Glow */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-green/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-brand-blue/10 rounded-full blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-green/30 to-brand-blue/20 flex items-center justify-center mb-4 shadow-glow_green ring-1 ring-white/10">
            <Leaf size={28} className="text-brand-green" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">VitalCrop AGW</h1>
          <p className="text-sm text-text-secondary mt-1">
            {step === 'email' ? 'Entra para ver y controlar tu cultivo' : 'Escribe el código que te hemos enviado'}
          </p>
        </div>

        {/* Email Form */}
        {step === 'email' && (
          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4 relative z-10 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Correo electrónico</label>
              <div className="relative group">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-blue transition-colors" />
                <input
                  type="email"
                  {...emailForm.register('email')}
                  placeholder="admin@vitalcrop.io"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-bg-primary/50 border border-brand-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue transition-all"
                />
              </div>
              {emailForm.formState.errors.email && (
                <p className="text-xs text-brand-red mt-1">{emailForm.formState.errors.email.message}</p>
              )}
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-brand-blue to-blue-500 hover:opacity-90 disabled:opacity-60 text-white text-sm font-semibold transition-all duration-200 shadow-glow_blue mt-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Continuar'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        )}

        {/* OTP Form */}
        {step === 'otp' && (
          <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4 relative z-10 animate-fade-in_up">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Código de acceso</label>
              <div className="relative group">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-green transition-colors" />
                <input
                  type="text"
                  maxLength={6}
                  {...otpForm.register('code')}
                  placeholder="123456"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-bg-primary/50 border border-brand-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/50 focus:border-brand-green transition-all tracking-widest font-mono text-center"
                />
              </div>
              {otpForm.formState.errors.code && (
                <p className="text-xs text-brand-red mt-1">{otpForm.formState.errors.code.message}</p>
              )}
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-brand-green to-emerald-500 hover:opacity-90 disabled:opacity-60 text-white text-sm font-semibold transition-all duration-200 shadow-glow_green mt-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Verificar y entrar'}
            </button>
            <button
              type="button" onClick={() => setStep('email')}
              className="w-full text-xs text-text-muted hover:text-text-primary mt-3 transition-colors"
            >
              Usar otro correo
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-text-muted mt-6 font-medium">
        VitalCrop AGW · Cultivo en ambiente controlado
      </p>
    </div>
  );
}
