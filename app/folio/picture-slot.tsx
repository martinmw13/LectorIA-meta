// One slot for a picture on its way: the skin drawing runs while it
// loads, freezes the moment the url is ready, and stays under the image
// until the image has loaded. Then the skin reveal plays over the paper.
"use client";

import type { ImgHTMLAttributes } from "react";
import { PictureDraw, usePictureLoaded } from "./picture-draw";
import { usePictureSkin } from "./picture-skin";

type SlotImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onLoad" | "onError">;

export function PictureSlot({
  phase,
  url,
  alt,
  className,
  imgProps,
}: {
  phase: "loading" | "ready";
  url: string;
  alt: string;
  className: string;
  imgProps?: SlotImgProps;
}) {
  const skin = usePictureSkin();
  const ready = phase === "ready";
  const { loaded, imgRef, markLoaded } = usePictureLoaded(ready ? url : "");
  const { className: imgClass, ...rest } = imgProps ?? {};
  return (
    <div className={className} role={ready ? undefined : "status"} data-picture-skin={skin}>
      {ready && loaded ? null : (
        <div className="pic-under">
          <PictureDraw skin={skin} frozen={ready} />
        </div>
      )}
      {ready ? (
        <img
          {...rest}
          ref={imgRef}
          onLoad={markLoaded}
          onError={markLoaded}
          className={`pic-img ${imgClass ?? ""} ${loaded ? `rv-${skin}` : "pic-waiting"}`}
          src={url}
          alt={alt}
        />
      ) : null}
    </div>
  );
}
