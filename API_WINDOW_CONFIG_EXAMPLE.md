# Exemplo de Resposta da API com Configurações de Janela

## Formato da Resposta da API

A API pode retornar configurações de posicionamento e tamanho da janela no seguinte formato:

### Exemplo 1: Posicionamento no Canto Inferior Direito
```json
{
  "videos": [
    {
      "id": "video_001",
      "video_id": "vid_123",
      "title": "Vídeo Promocional",
      "video_url": "https://example.com/video.mp4",
      "window_config": {
        "position": {
          "anchor": "bottom-right",
          "x": null,
          "y": null
        },
        "size": {
          "width": 854,
          "height": 480
        }
      }
    }
  ]
}
```

### Exemplo 2: Posicionamento Coordenadas Específicas
```json
{
  "videos": [
    {
      "id": "video_002",
      "video_id": "vid_456",
      "title": "Vídeo Institucional",
      "video_url": "https://example.com/video2.mp4",
      "window_config": {
        "position": {
          "x": 100,
          "y": 100
        },
        "size": {
          "width": 1280,
          "height": 720
        }
      }
    }
  ]
}
```

### Exemplo 3: Posicionamento Central
```json
{
  "videos": [
    {
      "id": "video_003",
      "video_id": "vid_789",
      "title": "Vídeo Tutorial",
      "video_url": "https://example.com/video3.mp4",
      "window_config": {
        "position": {
          "anchor": "center"
        },
        "size": {
          "width": 640,
          "height": 360
        }
      }
    }
  ]
}
```

## Opções de Posicionamento (anchor/gravity)

- `"top-left"` ou `"north-west"` - Canto superior esquerdo
- `"top-right"` ou `"north-east"` - Canto superior direito  
- `"bottom-left"` ou `"south-west"` - Canto inferior esquerdo
- `"bottom-right"` ou `"south-east"` - Canto inferior direito (padrão)
- `"center"` ou `"middle"` - Centro da tela
- `"top-center"` ou `"north"` - Centro superior
- `"bottom-center"` ou `"south"` - Centro inferior

## Comportamento Padrão

Se a API não fornecer `window_config` ou se os valores forem `null`:

- **Posição**: Canto inferior direito (`bottom-right`)
- **Tamanho**: Valores padrão da configuração (`854x480`)
- **Margem**: 50px das bordas da tela

## Prioridade

1. Coordenadas explícitas (`x`, `y`) - se fornecidas
2. Âncora/gravidade (`anchor`, `gravity`) - se coordenadas não fornecidas
3. Padrão da aplicação - se nada for fornecido

## Validações

- A janela nunca sairá fora da área de trabalho visível
- Tamanho mínimo respeitado
- Valores inválidos são ignorados e usados os padrões
