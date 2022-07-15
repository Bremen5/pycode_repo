import os
import qrcode

img = qrcode.make("https://kabutan.jp/")
img.save("qr.png","PNG")
os.system("open qr.png")