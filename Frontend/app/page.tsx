'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import PixelBlast from '@/components/PixelBlast';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'search' | 'tagging' | 'summary'>('search');

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-x-hidden selection:bg-primary/30 selection:text-primary">
      {/* Interactive WebGL PixelBlast Canvas Background */}
      <div className="fixed inset-0 z-0 opacity-30 pointer-events-auto">
        <PixelBlast
          variant="diamond"
          color="#10b981"
          pixelSize={4}
          speed={0.4}
          liquid={true}
          enableRipples={true}
        />
      </div>

      {/* Main Foreground Container */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header / Navbar */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40 transition-all">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-md">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                  VaultMind
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Smart Storage</span>
              </div>
            </Link>

            {/* Nav Links */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
              <a href="#features" className="hover:text-primary transition-colors">Features</a>
              <a href="#ai-engine" className="hover:text-primary transition-colors">AI Intelligence</a>
              <a href="#architecture" className="hover:text-primary transition-colors">Architecture</a>
              <a href="#security" className="hover:text-primary transition-colors">Security</a>
            </nav>

            {/* Auth & Theme Buttons */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {user ? (
                <Link
                  href="/dashboard"
                  className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  Go to Dashboard
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                  >
                    Get Started Free
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative px-6 pt-24 pb-20 md:pt-32 md:pb-28 max-w-7xl mx-auto text-center flex flex-col items-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-8 backdrop-blur-md animate-pulse">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            Powered by Google Gemini AI & Supabase Storage
          </div>

          {/* Main Title */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl leading-[1.1] mb-6">
            Intelligent Cloud Storage{' '}
            <span className="bg-gradient-to-r from-primary via-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Reimagined with AI
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            Upload files effortlessly. Search by natural language concepts, generate automatic document summaries, and get AI-driven tags in seconds.
          </p>

          {/* Hero Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-16">
            <Link
              href={user ? "/dashboard" : "/register"}
              className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-95 transition-all shadow-xl shadow-primary/25 flex items-center justify-center gap-3 group"
            >
              <span>{user ? "Open Your Workspace" : "Start Storing Free"}</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#features"
              className="px-8 py-4 rounded-xl border border-border/80 bg-card/60 hover:bg-accent hover:text-accent-foreground font-semibold text-base backdrop-blur-md transition-all flex items-center justify-center gap-2"
            >
              <span>Explore Features</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-4xl border border-border/50 bg-card/40 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-primary">5MB</span>
              <span className="text-xs text-muted-foreground mt-1">Instant Upload</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-foreground">100%</span>
              <span className="text-xs text-muted-foreground mt-1">AI Automated</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-primary">Gemini 1.5</span>
              <span className="text-xs text-muted-foreground mt-1">AI Model Engine</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-extrabold text-foreground">Secure</span>
              <span className="text-xs text-muted-foreground mt-1">Signed URL Access</span>
            </div>
          </div>
        </section>

        {/* AI Capabilities Interactive Demo Section */}
        <section id="ai-engine" className="py-20 px-6 max-w-7xl mx-auto w-full">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Experience Next-Gen File Processing
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Our automated AI background engine reads, understands, and organizes your files automatically.
            </p>
          </div>

          {/* Interactive Tab Switcher */}
          <div className="flex justify-center gap-3 mb-8">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'search'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-card/60 text-muted-foreground hover:bg-accent border border-border/50'
              }`}
            >
              🔍 Semantic Search
            </button>
            <button
              onClick={() => setActiveTab('tagging')}
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'tagging'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-card/60 text-muted-foreground hover:bg-accent border border-border/50'
              }`}
            >
              🏷️ Smart Auto-Tagging
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                activeTab === 'summary'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-card/60 text-muted-foreground hover:bg-accent border border-border/50'
              }`}
            >
              📄 Instant Summarizer
            </button>
          </div>

          {/* Demo Card Display */}
          <div className="max-w-3xl mx-auto border border-border/60 bg-card/80 backdrop-blur-2xl rounded-2xl p-8 shadow-2xl">
            {activeTab === 'search' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-3 border border-primary/40 bg-background/80 px-4 py-3 rounded-xl shadow-inner">
                  <span className="text-primary font-bold">Query:</span>
                  <span className="text-foreground italic">"Find financial statements or invoices from last quarter"</span>
                </div>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-foreground">Q3_Invoice_2026.pdf</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/20 text-primary font-semibold">98% Match</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Matches document content: "Quarterly earnings report, billing breakdown, total payable: $4,500."
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'tagging' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between p-4 rounded-xl bg-background/60 border border-border/60">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">John_Doe_Resume_2026.pdf</h4>
                    <p className="text-xs text-muted-foreground mt-1">Automatically categorized as <strong className="text-primary">Resume</strong></p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-medium">#SoftwareEngineer</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-medium">#React</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-medium">#FullStack</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'summary' && (
              <div className="space-y-3 animate-in fade-in duration-300">
                <div className="p-4 rounded-xl bg-background/60 border border-border/60">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">AI Summary Output</span>
                  <p className="text-sm text-foreground leading-relaxed italic">
                    "This document outlines the project roadmap for Q3 2026, focusing on cloud infrastructure scaling, Supabase storage integration, and Gemini AI search capabilities."
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Main Features Grid */}
        <section id="features" className="py-20 px-6 max-w-7xl mx-auto w-full">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Everything You Need for Modern File Management
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Built for speed, intelligence, and seamless productivity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl hover:border-primary/50 transition-all hover:-translate-y-1 shadow-lg group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Semantic TF-IDF Search</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Find files by searching for keywords inside PDF, Word, or TXT contents, even if you forgot the exact file name.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl hover:border-primary/50 transition-all hover:-translate-y-1 shadow-lg group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Smart Auto-Categorization</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gemini AI inspects files upon upload and automatically applies tags and categories (Invoices, Resumes, Contracts, etc.).
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl hover:border-primary/50 transition-all hover:-translate-y-1 shadow-lg group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Instant AI Summaries</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Hover over any document to read a concise 2-3 sentence summary without having to open the full file.
              </p>
            </div>
          </div>
        </section>

        {/* Security & Tech Stack Section */}
        <section id="security" className="py-16 px-6 max-w-7xl mx-auto w-full">
          <div className="border border-border/60 bg-card/40 backdrop-blur-2xl rounded-3xl p-10 md:p-14 text-center">
            <h2 className="text-3xl font-bold mb-4">Built on Production-Grade Tech</h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-8">
              High performance, encrypted authorization, and reliable cloud storage.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <span className="px-4 py-2 rounded-xl bg-background/80 border border-border/80 text-sm font-semibold">Next.js 15 App Router</span>
              <span className="px-4 py-2 rounded-xl bg-background/80 border border-border/80 text-sm font-semibold">Tailwind CSS v4</span>
              <span className="px-4 py-2 rounded-xl bg-background/80 border border-border/80 text-sm font-semibold text-primary">Google Gemini 1.5 AI</span>
              <span className="px-4 py-2 rounded-xl bg-background/80 border border-border/80 text-sm font-semibold">Supabase Storage</span>
              <span className="px-4 py-2 rounded-xl bg-background/80 border border-border/80 text-sm font-semibold">MongoDB Atlas</span>
              <span className="px-4 py-2 rounded-xl bg-background/80 border border-border/80 text-sm font-semibold">JWT & Cookie Auth</span>
            </div>
          </div>
        </section>

        {/* CTA Footer Section */}
        <footer className="mt-auto border-t border-border/40 backdrop-blur-md bg-background/60 py-10 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </div>
            <div>
              © 2026 VaultMind. Built with Next.js, Supabase & Google Gemini AI.
            </div>
            <div className="flex gap-6">
              <Link href="/login" className="hover:text-primary transition-colors">Sign In</Link>
              <Link href="/register" className="hover:text-primary transition-colors">Register</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
