import { createClient } from './supabase-auth.js';

// ============ NAV SCROLL ============
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
});

// ============ PARTICLES ============
// Particles disabled for performance on low-end devices

// ============ PARALLAX ============
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const heroVisual = document.getElementById('heroVisual');
if (heroVisual && !prefersReducedMotion) {
  heroVisual.addEventListener('mousemove', (e) => {
    const rect = heroVisual.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    const cards = heroVisual.querySelectorAll('[data-depth]');
    cards.forEach(card => {
      const depth = parseFloat(card.getAttribute('data-depth'));
      card.style.transform = `translate(${x * depth * 15}px, ${y * depth * 15}px)`;
    });
  });

  heroVisual.addEventListener('mouseleave', () => {
    const cards = heroVisual.querySelectorAll('[data-depth]');
    cards.forEach(card => {
      card.style.transform = '';
    });
    const dashboard = document.getElementById('heroDashboard');
    if (dashboard) {
      dashboard.style.transform = '';
      dashboard.style.removeProperty('--glow-x');
      dashboard.style.removeProperty('--glow-y');
    }
  });

  const dashboard = document.getElementById('heroDashboard');
  if (dashboard) {
    dashboard.addEventListener('mousemove', (e) => {
      const rect = dashboard.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      dashboard.style.setProperty('--glow-x', x + '%');
      dashboard.style.setProperty('--glow-y', y + '%');
    });
    dashboard.addEventListener('mouseleave', () => {
      dashboard.style.removeProperty('--glow-x');
      dashboard.style.removeProperty('--glow-y');
    });
  }
}

// ============ COUNT-UP ANIMATION ============
function animateCountUp() {
  document.querySelectorAll('.count-up, .analytics-number').forEach(el => {
    const target = parseFloat(el.getAttribute('data-target'));
    if (!target || el.classList.contains('counted')) return;
    el.classList.add('counted');

    const duration = 2000;
    const start = performance.now();
    const isDecimal = target % 1 !== 0;

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;
      el.textContent = isDecimal ? current.toFixed(1) : Math.floor(current).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
      else el.textContent = isDecimal ? target.toFixed(1) : target.toLocaleString();
    }
    requestAnimationFrame(update);
  });
}

// ============ SCROLL ANIMATIONS ============
const scrollObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      if (entry.target.classList.contains('analytics-number') || entry.target.querySelector('.count-up')) {
        animateCountUp();
      }
      scrollObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

function initScrollAnimations() {
  document.querySelectorAll('.scroll-fade, .feature-card, .pricing-card, .workflow-step, .showcase-section, .analytics-item').forEach(el => {
    if (!el.classList.contains('scroll-fade')) el.classList.add('scroll-fade');
    scrollObserver.observe(el);
  });

  document.querySelectorAll('.analytics-number').forEach(el => {
    scrollObserver.observe(el);
  });

  document.querySelectorAll('.count-up').forEach(el => {
    scrollObserver.observe(el);
  });
}

// ============ DASHBOARD BAR ANIMATION ============
function animateDashboardBars() {
  const bars = document.querySelectorAll('.dash-bar');
  bars.forEach((bar, i) => {
    bar.style.setProperty('--i', i);
  });
}

// ============ AUTH MODAL ============
let chosenPlan = 'starter';
let authMode = 'login';
let supabase = null;

function initSupabase() {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('forgeflow_supabase_url') || 'https://secaghvmfkujeciiapav.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('forgeflow_supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlY2FnaHZtZmt1amVjaWlhcGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NDA1OTYsImV4cCI6MjA4OTMxNjU5Nn0.sXDDLStGTQ4txc_YcN7MIE1JC96R94ILafoID-_2Nzs';
    if (supabaseUrl && supabaseKey && createClient) {
      supabase = createClient(supabaseUrl, supabaseKey);
      supabase.auth.getSession().then(({ data, error }) => {
        console.log('Supabase connection:', error ? 'error' : 'OK');
      });
    }
  } catch (e) {
    console.warn('Supabase init failed:', e);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

function openAuthModal(tab) {
  document.getElementById('authModal').classList.add('open');
  switchAuthTab(tab || 'login');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
}

function switchAuthTab(tab) {
  authMode = tab;
  const title = document.getElementById('authModalTitle');
  const subtitle = document.getElementById('authModalSubtitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const nameGroup = document.getElementById('nameGroup');
  const companyGroup = document.getElementById('companyGroup');
  const planGroup = document.getElementById('planGroup');
  const passwordGroup = document.getElementById('passwordGroup');
  const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
  const footerText = document.getElementById('authFooterText');
  const terms = document.getElementById('authTerms');
  
  if (tab === 'login') {
    title.textContent = 'Welcome back';
    subtitle.textContent = 'Sign in to continue to your dashboard';
    submitBtn.textContent = 'Sign in';
    nameGroup.style.display = 'none';
    companyGroup.style.display = 'none';
    planGroup.style.display = 'none';
    confirmPasswordGroup.style.display = 'none';
    footerText.innerHTML = 'Don\'t have an account? <a href="signup.html">Sign up free</a>';
    terms.style.display = 'none';
  } else {
    title.textContent = 'Get started';
    subtitle.textContent = 'Create your free account - no credit card required';
    submitBtn.textContent = 'Create account';
    nameGroup.style.display = 'block';
    companyGroup.style.display = 'block';
    planGroup.style.display = 'block';
    confirmPasswordGroup.style.display = 'block';
    footerText.innerHTML = 'Already have an account? <a href="login.html">Sign in</a>';
    terms.style.display = 'block';
  }
  
  const existingError = document.querySelector('.auth-error-msg');
  if (existingError) existingError.remove();
}

function selectPlan(el, plan) {
  document.querySelectorAll('.plan-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  chosenPlan = plan;
}

function showAuthError(msg) {
  const form = document.getElementById('authForm');
  const existingError = document.querySelector('.auth-error-msg');
  if (existingError) existingError.remove();
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'auth-error-msg';
  errorDiv.style.cssText = 'background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px;';
  errorDiv.textContent = msg;
  form.insertBefore(errorDiv, form.firstChild);
}

function handleSocialLogin(provider) {
  console.log('Social login with:', provider);
  
  if (!supabase) {
    showAuthError('Authentication service is unavailable. Please try again later.');
    return;
  }
  
  const redirectBase = window.location.href.replace(/[^/]*$/, '');

  if (provider === 'google') {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectBase + 'app.html'
      }
    }).then(({ data, error }) => {
      if (error) {
        console.error('Google login error:', error);
        showAuthError('Failed to connect with Google. Please try again.');
      }
    });
  } else if (provider === 'microsoft') {
    supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: redirectBase + 'app.html'
      }
    }).then(({ data, error }) => {
      if (error) {
        console.error('Microsoft login error:', error);
        showAuthError('Failed to connect with Microsoft. Please try again.');
      }
    });
  } else if (provider === 'facebook') {
    supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: redirectBase + 'app.html'
      }
    }).then(({ data, error }) => {
      if (error) {
        console.error('Facebook login error:', error);
        showAuthError('Failed to connect with Facebook. Please try again.');
      }
    });
  }
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');
  
  if (!supabase) {
    showAuthError('Authentication service is unavailable. Please try again later.');
    return;
  }

  if (!email || !password) {
    showAuthError('Please fill in all required fields');
    return;
  }
  
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters');
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = authMode === 'login' ? 'Signing in...' : 'Creating account...';
  
  try {
    console.log('Attempting auth, mode:', authMode, 'email:', email);
    
    if (authMode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Login error:', error);
        throw error;
      }
      console.log('Login success, redirecting to app');
      window.location.href = 'app.html';
    } else {
      const nameInput = document.getElementById('authName').value.trim();
      const nameParts = nameInput.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const companyInput = document.getElementById('authCompany')?.value.trim() || '';
      
      console.log('Signup - creating user with metadata');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyInput,
            plan: chosenPlan
          }
        }
      });
      
      if (error) {
        console.error('Signup error:', error);
        throw error;
      }
      
      console.log('Signup response:', data);
      
      if (data.user && !data.session) {
        alert('Account created! Please check your email to confirm your account, then sign in.');
        switchAuthTab('login');
      } else if (data.session) {
        window.location.href = 'app.html';
      }
    }
  } catch (err) {
    console.error('Auth error:', err);
    showAuthError(err.message || 'Authentication failed. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = authMode === 'login' ? 'Sign in' : 'Create account';
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPw').value;

  if (!supabase) {
    showAuthError('Authentication service is unavailable. Please try again later.');
    return;
  }

  if (!email || !password) {
    showAuthError('Please enter both email and password');
    return;
  }

  setButtonLoading('loginBtn', true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (data.user) {
      const firstName = data.user.user_metadata?.first_name || ''
      const lastName = data.user.user_metadata?.last_name || ''
      const initials = (firstName[0] || data.user.email[0]).toUpperCase() + 
                       (lastName[0] || '').toUpperCase()
      localStorage.setItem('forgeflow_user', JSON.stringify({
        initials: initials,
        email: data.user.email,
        planName: 'Professional',
        planLabel: 'PRO'
      }));
    }
    
    window.location.href = 'app.html';
  } catch (error) {
    showAuthError(error.message || 'Failed to login. Please try again.');
  } finally {
    setButtonLoading('loginBtn', false);
  }
}

function goToApp(initials, planName, planLabel) {
  localStorage.setItem('forgeflow_user', JSON.stringify({ initials, planName, planLabel }));
  window.location.href = 'app.html';
}

// ============ BILLING TOGGLE ============
let isAnnual = false;
const prices = { 
  starter: { monthly: '$150', annual: '$120' }, 
  pro: { monthly: '$250', annual: '$200' }
};

function togglePricing() {
  isAnnual = !isAnnual;
  document.getElementById('pricingToggle').classList.toggle('on', isAnnual);
  
  const starterPrice = document.getElementById('price-starter');
  const proPrice = document.getElementById('price-pro');
  
  if (isAnnual) {
    starterPrice.innerHTML = prices.starter.annual + '<sup>/mo</sup>';
    proPrice.innerHTML = prices.pro.annual + '<sup>/mo</sup>';
  } else {
    starterPrice.innerHTML = prices.starter.monthly + '<sup>/mo</sup>';
    proPrice.innerHTML = prices.pro.monthly + '<sup>/mo</sup>';
  }
}

window.togglePricing = togglePricing;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;
window.selectPlan = selectPlan;
window.scrollToSection = (id) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};
window.handleAuth = handleAuth;
window.handleSocialLogin = handleSocialLogin;

// ============ PREVIEW CHART ============
window.addEventListener('load', () => {
  const ctx = document.getElementById('previewChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Oct','Nov','Dec','Jan','Feb','Mar'],
      datasets: [{
        data: [58, 72, 78, 75, 82, 84],
        backgroundColor: 'rgba(255, 106, 0, 0.12)',
        borderColor: '#FF6A00',
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9CA3AF' } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9 }, color: '#9CA3AF' } }
      }
    }
  });
});

// ============ SMOOTH SCROLL & INIT ============
document.addEventListener('DOMContentLoaded', function() {
  initScrollAnimations();
  animateDashboardBars();
  
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const t = document.querySelector(a.getAttribute('href'));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Close modal on backdrop click
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.addEventListener('click', function(e) {
      if (e.target === this) closeAuthModal();
    });
  }
});

// ============ CHECK AUTH STATUS ============
async function checkAuthStatus() {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const initials = (user.user_metadata?.first_name?.[0] || 'U') + 
                         (user.user_metadata?.last_name?.[0] || '');
        localStorage.setItem('forgeflow_user', JSON.stringify({
          initials: initials.toUpperCase(),
          email: user.email,
          planName: 'Professional',
          planLabel: 'PRO'
        }));
      }
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }
}

checkAuthStatus();