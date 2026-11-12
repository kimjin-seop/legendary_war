"""알파 후처리 '검은 얼룩' 점검(호출 없음): 원본 JPEG 에서 밝은(최대값>=120) 픽셀이 PNG 에서 어두워진(최대값<=40) 개수.
원인: alpha_process B 의 Lab 임계(T_hi=120)가 무채색 회색 그늘을 반투명으로 잡고 defringe 가 윤곽선 검정으로 덮어씀.
사용: python portrait_darkspot_check.py <src.jpg> <out.png>"""
import sys, numpy as np
from PIL import Image
s = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); o = np.asarray(Image.open(sys.argv[2]).convert('RGBA')).astype(int)
if s.shape[:2] != o.shape[:2]: s = np.asarray(Image.open(sys.argv[1]).convert('RGB').resize(o.shape[1::-1], Image.LANCZOS)).astype(int)
bad = (s.max(2) >= 120) & (o[..., :3].max(2) <= 40) & (o[..., 3] > 128)
print(f"{sys.argv[2].split('/')[-1]:28s} darkened_px={int(bad.sum())}")
