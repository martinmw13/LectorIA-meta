// Inline SVG defs for the home spread: the wobble and watercolor
// filters the CSS references, plus the Oz panel treatments.
export function HomeDefs() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="f-wob-s" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency=".18" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale=".9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="f-wc-s" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation=".35" />
        </filter>
        <filter id="f-wob-box" x="-2%" y="-10%" width="104%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="f-wc-box" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".025" numOctaves="3" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="1.2" />
        </filter>
        <filter id="img-wc" x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="2.6" result="wash" />
          <feComponentTransfer in="wash" result="light">
            <feFuncR type="linear" slope=".72" intercept=".3" />
            <feFuncG type="linear" slope=".72" intercept=".29" />
            <feFuncB type="linear" slope=".72" intercept=".3" />
          </feComponentTransfer>
          <feComponentTransfer in="SourceGraphic" result="orig">
            <feFuncR type="linear" slope=".8" intercept=".2" />
            <feFuncG type="linear" slope=".8" intercept=".2" />
            <feFuncB type="linear" slope=".8" intercept=".22" />
          </feComponentTransfer>
          <feBlend in="orig" in2="light" mode="multiply" result="mix" />
          <feComposite in="mix" in2="light" operator="arithmetic" k1="0" k2=".55" k3=".45" k4=".06" result="m2" />
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 .2  0 0 0 0 .25  0 0 0 0 .4  0 0 0 -.25 .2" result="ga" />
          <feComposite in="ga" in2="m2" operator="atop" />
        </filter>
        <filter id="img-ink" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" result="g" />
          <feConvolveMatrix in="g" order="3" kernelMatrix="-1 -1 -1 -1 8.6 -1 -1 -1 -1" divisor="0.6" preserveAlpha="true" result="edge" />
          <feComponentTransfer in="g" result="lv">
            <feFuncR type="discrete" tableValues="0.03 0.35 0.7 1 1" />
            <feFuncG type="discrete" tableValues="0.36 0.58 0.82 1 1" />
            <feFuncB type="discrete" tableValues="1 1 1 1 1" />
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="lv" in2="n" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
