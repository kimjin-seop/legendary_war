# SRPG 임진왜란 편 10개 스테이지 타일 맵 원본 데이터 (사용자 제공 원문, 2026-11-01)

> 사용자가 직접 제공한 원본. 지형 배치는 임의 변경 금지(원본과 동일하게 구현). 이 파일은 수정하지 말고 변환 산출물은 별도 파일로 만든다.

## 1. 타일 코드 범례

각 맵은 가로 24칸 × 세로 20칸으로 구성한다. 각 문자는 하나의 타일을 의미하며, 좌측 상단이 (1,1)이다.

| 코드 | 지형 | 설명 |
|---|---|---|
| `~` | 바다 | 일반 바다 |
| `.` | 평지 | 일반 평지 |
| `L` | 육지 | 일반 육지 및 잔디 |
| `S` | 모래 | 해안 및 모래 지형 |
| `F` | 숲 | 숲 및 나무 지형 |
| `R` | 암초/바위 | 암초, 바위 |
| `H` | 언덕 | 고지대 및 언덕 |
| `W` | 얕은 물/강 | 얕은 물, 강 |
| `C` | 성벽 | 성벽 및 방어벽 |
| `G` | 성문 | 성문 |
| `B` | 건물 | 건물 |
| `T` | 탑 | 망루 및 탑 |
| `O` | 목표 | 주요 목표 지점 |
| `X` | 통행 불가 | 낭떠러지, 공허 등 |
| `A` | 아군 시작 위치 | 아군 배치 지점 |
| `E` | 적군 시작 위치 | 적군 배치 지점 |
| `P` | 항구 | 항구 및 선박 정박 지점 |

## 2. 스테이지별 타일 배치

각 행이 24개 타일, 총 20개 행.

### 01. 옥포해전
전장 콘셉트: 해안과 항구를 중심으로 펼쳐지는 해상 전투.

```text
LLLLLSSS~~~~~~~~~~~~~~~~
LLLLLSSS~~~~~~~~~~~~~~~~
LLLLLSS~~~~~~~~~~~~~~~~~
LLLLLSS~~~~~~~~~~~~~~~~~
LLLLLSSS~~R~~~~~~~~~~~~~
LLLLLSSSRRRRR~~~~~~~~~~~
LLLLLSS~~~R~~~~~~~E~~~~~
LLLLLSS~~A~~~~~~~~~~~~~~
LLLLPPSS~~A~~~~~~~~~E~~~
LLLLPPSS~~~~~~~~~~~~~~~~
LLLLPPS~~A~~~~~~~~~~~~~~
LLLLLSS~~~~A~~~~~~~~~~~~
LLLLLSSS~~~~~~~~~~E~~~~~
LLLLLSSS~~~~~~~~~R~~~~~~
LLLLLSS~~~~~~~~RRRRR~E~~
LLLLLSS~~~~~~~~~~R~~~~~~
LLLLLSSS~~~~~~~~~~~~~~~~
LLLLLSSS~~~~~~~~~~~~~~~~
LLLLLSS~~~~~~~~~~~~~~~~~
LLLLLSS~~~~~~~~~~~~~~~~~
```

### 02. 정암진 전투
전장 콘셉트: 숲으로 둘러싸인 강과 도하 지점이 존재하는 지형.

```text
FFFFFFLLLWWWLLLLLLFFFFFF
FFFFFFLLLLWWWLLLLLFFFFFF
FFFFFFLLLLWWWLLLLLFFFFFF
FFFFFFLLLLLWWWLLLLFFFFFF
FFFFFFLLLLSSSSSLLLFFFFFF
FFFFFFLLLLLWWWLLLLFFFFFF
FFFFFFLLLLLWWWLLLLFFFFFF
FFFFFFLLLLWWWLLLELFFFFFF
FFFFFFLALLWWWLLLLLFFFFFF
FFFFFFLLLWWWLLLLELFFFFFF
FFFFFFLALSSSLLLLLLFFFFFF
FFFFFFLLLWWLLLLLLEFFFFFF
FFFFFFLLAWLLLLLLLLFFFFFF
FFFFFFLLLWLLLLLELLFFFFFF
FFFFFFAWWWLLLLLLLLFFFFFF
FFFFFFSSSSSLLLLLLLFFFFFF
FFFFFFLLWWWLLLLLLLFFFFFF
FFFFFFLLLWWWLLLLLLFFFFFF
FFFFFFLLLWWWLLLLLLFFFFFF
FFFFFFLLLLWWWLLLLLFFFFFF
```

### 03. 한산도해전
전장 콘셉트: 넓은 바다와 중앙 섬, 주변 암초가 존재하는 해상 전장.

```text
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~L~~~~~~
~~~~~~R~~~~L~~~~SSS~~~~~
~~~~~RRR~LLLSL~~~L~~~R~~
~~~~~~R~LLSSSSS~~~~~RRR~
~~~~~~~~~LLLSL~~~~~~~R~~
~~~~~~~~~~~L~~~~~~~~~~~~
~~~~A~~~~~~~~~~~~~~E~~~~
~~~~~A~~~~~~~~~~~~~~E~~~
~~~~A~~~~~~~O~~~~~~E~~~~
~~~~R~A~~~~~~~~~~~ER~~~~
~~~RRR~~~~~~~~~~~~RRR~~~
~~~RRR~~~~~~~~~~~RRRRR~~
~~~RRR~~~~~~~~~~~~RRR~~~
~~~~R~~~~~~~~~~~~~~R~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
```

### 04. 진주성 전투
전장 콘셉트: 성벽과 성문, 성 내부 건물 및 동쪽 강을 중심으로 구성된 공성전.

```text
FFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFF
LLLLLLLLLLLLLLLLLLLLLWWL
LLLLLLCCCCCCCCCCCCLLLWWL
LLLLLLC..........CLLLWWL
LLLLLLC.....TBBB.CLLLWWL
LLLALLC..BBB.BBB.CLELWWL
LLLLLLC..BBB.BBB.CLLLWWL
LLLALLC..BBB.....CLLLWWL
LLLLLLC.....O....CLELWWL
LLLLLLC..........CLLLWWL
LLLLALC..........CLLLWWL
LLLLLLC..........CELLWWL
LLLLLACCCCGGGGCCCCLLEWWL
LLLLLLLLLLLLLLLLLLLLLWWL
LLLLLLLLLLLLLLLLLLLLLWWL
FFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFF
```

### 05. 평양성 전투
전장 콘셉트: 대규모 성곽과 내부 건물, 복수의 성문을 가진 도심 공성전.

```text
FFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFF
LLLLLLLLLLLLLLLLLLLLLLLL
LLLLCCCCCCCCCCCCCCCCLLLL
LLLLCCCCCCCCCCCCCCCCLLLL
LLLLCCCBBCCCCCCBBCCCLELL
LLALCCCBBCCCCCCBBCCCLLLL
LLLLCCCCCCCTCCCCCCCCLLLL
....CCCCCCCCCCCCCCCC.E..
..A.CCCCCCBBCCCCCCCC....
....CCCCCCBBOCBBCCCC....
LLLLCCCCCCCCCCBBCCCCLLLL
LLLACCCCBBCCCCCCCBBCELLL
LLLLCCCCBBCCCCCCCBBCLLLL
LLLLCCCCCCCCCCCCCCCCLLLL
LLLLCCCGGCCCCCCGGCCCLLLL
LLLLALLLLLLLLLLLLLLELLLL
LLLLLLLLLLLLLLLLLLLLLLLL
LLLLLLLLLLLLLLLLLLLLLLLL
LLLLLLLLLLLLLLLLLLLLLLLL
```

### 06. 행주산성 전투
전장 콘셉트: 중앙 고지대와 방어 성벽, 주변 숲과 언덕이 결합된 산성 전투.

```text
LLLLLLLLLLLLLLLLLLLLLLLL
LLFLLLLLLLLHLLLLLLLLFLLL
LFFFLLLHHHHHHHHHLLLFFFLL
FFFFFHHHHHHLHHHHHHFFFFFL
FFFFFHCCCCCCCCCCCHFFFFFL
FFFFFFCLLLLLLLLLCFFFFFFF
FFFFFLCLLLLLLLLLCLFFFFFL
FFFFFLCLLLLTLLLLCLFFFFFL
LFFFLLCLALLLLLALCLLFFFLL
LLFHHLCLLALOALLLCLHHFLLL
LLLHHLCLLLLLLLLLCLHHLLLL
LLLHHHCLLLLLLLLLCHHHLLLL
LLLLHHCCCCCGCCCCCHHLLLLL
LLLLLHHHHHHLHHHHHHLLLLLL
LLLLLLLHHHHHHHHHLLLLLLLL
LLLLLLLLLLLHLLLLLLLLLLLL
LLLLLLLLLLLLLLLLLLELLLLL
LLLLLLLLELLLLLELLLLLLLLL
LLLLLLLLLLLELLLLLLLLLLLL
LLLLLLLLLLLLLLLLLLLLLLLL
```

### 07. 노량해전
전장 콘셉트: 넓은 야간 해상 전장과 다수의 암초가 배치된 해전.

```text
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~RRR~~~~~~~~~~~~~~~~~~
~~RRRRR~~~~~~~~~~~RRR~~~
~~~RRR~~~~~~~~~~~RRRRR~~
~~~~~~~~~~~~~~~~~~RRR~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~A~~~~~~~~~~~~~E~~~~~
~~~~~A~~~~~~~~~~~~~E~~~~
~~~~~~A~~~~~O~~~~~~~E~~~
~~~~~A~~~~~~~~~~~~~E~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~RRR~~~~~~
~~~~~~~RRR~~~~RRRRR~~~~~
~~~~~~RRRRR~~~~RRR~~~~~~
~~~~~~~RRR~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~
```

### 08. 번진 서가
전장 콘셉트: 기록이 붕괴한 서가. 검은 공허와 분리된 통로, 불안정한 지형으로 구성.

```text
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXX.......XXXXXXX
XX.......X.......XXXXXXX
XX.......X.......XXXXXXX
XX..A.A..X............XX
XX...A.A.X............XX
XX.......XRXXXXXR.....XX
XXXXXXXXRRX.....R.....XX
XXXX..................XX
XXXX........O....XXXXXXX
XXXX...................X
XXXX...................X
XXXX..............O....X
XXXXXRXXXXX............X
XXXXRXXXXXXXRXXXR......X
XXXXXX.......XXRX......X
XXXXXX.............EXXXX
XXXXXX...........EEXEXXX
XXXXXX.............XXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
```

### 09. 명량해전
전장 콘셉트: 좁은 해협과 양쪽 암벽, 중앙의 좁은 항로가 특징인 해전.

```text
~~~RR~~~~~~~~~~~~~~~RRR~
~~~~RR~~~~~~~~~~~~~~RRR~
~~~~RR~~~~~~~~~~~~~~RRR~
~~~~~RR~~~~~~~~~~~~~RRR~
~~~~~RR~~~~~~~~~~~~RRR~~
~~~~~RR~~R~~~~~~~~~RRR~~
~~~~~RR~~~~~~~~~~~RRR~~~
~~~~~RR~A~~~~~~~~~RRR~~~
~~~~RR~~~A~~~~R~~RRR~~~~
~~~~RR~~A~~~~~~~RRR~~~~~
~~~RR~~~~A~O~~~~RRR~~~~~
~~RR~~~~~~~~~~E~RRR~~~~~
~~RR~~~~~~~~~~~ERRR~~~~~
~RR~~~~~~~R~~~E~RRR~~~~~
~RR~~~~~~~~~~~~E~RRR~~~~
~RR~~~~~~~~~~~~~~RRR~~~~
~RR~~~~~~~~~~R~~~~RRR~~~
~RR~~~~~~~~~~~~~~~RRR~~~
~~RR~~~~~~~~~~~~~~~RRR~~
~~RR~~~~~~~~~~~~~~~~RRR~
```

### 10. 마지막 서가
전장 콘셉트: 중앙 보스 전장과 주변의 부서진 플랫폼, 언덕 형태의 구조물로 구성된 최종 전투 필드.

```text
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XX.....XXXXHXXXXX.....XX
XX.....HHHHHHHHHX.....XX
XX.....HHHHHHHHHH.....XX
XX.....XX..T...XX.....XX
XXXHHH...........HHHXXXX
XXXHHH...........HHHXXXX
XXXHHA............EHXXXX
XXHHH.A....OO.....HEHXXX
XXXHHA............EHXXXX
XXXHHHA..........HHEXXXX
XXXHHHXX.........HHHXXXX
XXXXHHHH....T..XXHHXXXXX
XX.....HHHHHHHHHH.....XX
XX.....HHHHHHHHHX.....XX
XX.....XXXXHXXXXX.....XX
XX.....XXXXXXXXXX.....XX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
```

## 3. 맵 데이터 적용 시 주의사항 (사용자 원문)

1. 모든 맵은 24×20 크기를 유지한다.
2. 각 행의 문자 수가 반드시 24개인지 검증한다.
3. 전체 행 수가 반드시 20개인지 검증한다.
4. `A`, `E`는 시작 위치 표시이므로 지형과 별도의 배치 정보로 분리할 수 있다.
5. `P`는 항구 지형이다.
6. `O`는 맵의 주요 목표 위치다.
7. `X`는 통행할 수 없는 영역이다.
8. 타일 배열의 지형 배치는 임의로 변경하지 말고 원본 배치와 동일하게 구현한다.
9. 각 타일의 색상과 지형 표현은 범례를 기준으로 통일한다.
10. 맵의 실제 그래픽 오브젝트는 타일 배치를 기반으로 자연스럽게 표현한다.

※ 위 배열은 현재 작성된 컬러 맵의 원본 배치다. 최종 게임 적용 시에는 타일 그래픽과 오브젝트를 추가하되, 원본 지형의 위치와 형태를 유지한다.
