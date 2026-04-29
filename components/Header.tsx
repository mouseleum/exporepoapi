export function Header() {
  return (
    <header>
      <div className="logo">
        <div className="logo-mark">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="xg"
                x1="4"
                y1="4"
                x2="28"
                y2="28"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#38b6ff" />
                <stop offset="100%" stopColor="#5b7fff" />
              </linearGradient>
            </defs>
            <path d="M6 5 L14.5 15.5 L11 20 L3 8 Z" fill="url(#xg)" />
            <path d="M26 5 L17.5 15.5 L21 20 L29 8 Z" fill="url(#xg)" />
            <path d="M11 20 L14.5 15.5 L16 17.5 L13 22 Z" fill="#2a8fd4" />
            <path d="M21 20 L17.5 15.5 L16 17.5 L19 22 Z" fill="#2a8fd4" />
            <path
              d="M22 6 L28 6 L28 12 L25 9 L22 12 L19 9 Z"
              fill="url(#xg)"
            />
          </svg>
        </div>
        <div>
          <div className="logo-name">
            e<span style={{ fontWeight: 600 }}>X</span>potential
          </div>
          <div className="logo-tag">Exhibitor Tools</div>
        </div>
      </div>
    </header>
  );
}
