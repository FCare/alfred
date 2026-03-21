# Alfred - Gestionnaire de Listes de Courses

Alfred est un gestionnaire de listes de courses modernes avec partage entre utilisateurs, développé avec FastAPI et JavaScript vanilla.

## Fonctionnalités

- ✅ Création et gestion de listes de courses
- ✅ Ajout d'éléments avec nom, quantité, description et photo
- ✅ Partage de listes entre utilisateurs avec permissions granulaires
- ✅ Upload et optimisation d'images
- ✅ Recherche dans les listes et éléments
- ✅ Interface moderne et responsive
- ✅ Authentification via voight-kampff
- ✅ Déploiement Docker

## Prérequis

- Docker et docker-compose
- Service d'authentification voight-kampff en cours d'exécution sur le port 8000

## Installation et Déploiement

### 1. Cloner le projet

```bash
git clone [url-du-repo]
cd alfred
```

### 2. Configuration

Copier et modifier le fichier d'environnement :

```bash
cp .env .env.local
```

Modifier `.env.local` selon vos besoins :

```env
SECRET_KEY=votre-clé-secrète-très-sécurisée
DATABASE_URL=sqlite:///./alfred.db
VOIGHT_KAMPFF_URL=http://host.docker.internal:8000
DEBUG=false
```

### 3. Lancement avec Docker

```bash
# Construction et lancement des services
docker-compose up -d --build

# Vérification des logs
docker-compose logs -f

# Arrêt des services
docker-compose down
```

### 4. Accès à l'application

- **Frontend** : http://localhost:5213
- **API Documentation** : http://localhost:5213/api/docs (en mode debug)
- **Backend Health Check** : http://localhost:5213/api/health

## Architecture

### Backend (FastAPI)

- **Port** : 8000 (interne au container)
- **Base de données** : SQLite (peut être changée pour PostgreSQL)
- **Authentification** : Integration avec voight-kampff via cookies de session
- **Upload d'images** : Traitement et optimisation avec Pillow
- **API REST** : Endpoints complets pour toutes les fonctionnalités

### Frontend (Vanilla JS)

- **Framework** : JavaScript vanilla modulaire
- **Styling** : CSS moderne basé sur le design de Joshua
- **Architecture** : Modules séparés pour chaque fonctionnalité
- **Responsive** : Interface adaptative mobile/desktop

### Déploiement

- **Reverse Proxy** : Nginx pour servir le frontend et proxifier l'API
- **Port public** : 5213
- **Volumes persistants** : Base de données et uploads
- **Réseaux** : Isolation des services

## Structure du Projet

```
alfred/
├── backend/                 # Backend FastAPI
│   ├── app/
│   │   ├── models/         # Modèles SQLAlchemy et Pydantic
│   │   ├── routers/        # Endpoints API
│   │   ├── services/       # Logique métier
│   │   ├── utils/          # Utilitaires
│   │   └── main.py         # Application principale
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # Frontend JavaScript
│   └── alfred-frontend/
│       ├── modules/        # Modules JS
│       ├── assets/         # Ressources statiques
│       ├── index.html
│       ├── script.js
│       └── styles.css
├── docker-compose.yml
├── nginx.conf
├── .env
└── README.md
```

## API Documentation

L'API suit les conventions REST et inclut :

### Listes

- `GET /api/v1/lists` - Récupérer toutes les listes
- `POST /api/v1/lists` - Créer une nouvelle liste
- `PUT /api/v1/lists/{id}` - Modifier une liste
- `DELETE /api/v1/lists/{id}` - Supprimer une liste

### Éléments

- `GET /api/v1/items/{list_id}` - Récupérer les éléments d'une liste
- `POST /api/v1/items` - Ajouter un élément
- `PUT /api/v1/items/{id}` - Modifier un élément
- `DELETE /api/v1/items/{id}` - Supprimer un élément

### Partage

- `POST /api/v1/shares/invite` - Inviter un utilisateur
- `GET /api/v1/shares/invitations` - Récupérer les invitations
- `POST /api/v1/shares/accept` - Accepter une invitation

### Upload

- `POST /api/v1/upload/image` - Upload d'image
- `GET /uploads/{filename}` - Servir une image

### Recherche

- `GET /api/v1/search` - Rechercher dans les listes

## Développement

### Développement local (sans Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (servir avec un serveur HTTP local)
cd frontend/alfred-frontend
python -m http.server 3000
```

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `SECRET_KEY` | Clé secrète pour la signature | - |
| `DATABASE_URL` | URL de la base de données | `sqlite:///./alfred.db` |
| `VOIGHT_KAMPFF_URL` | URL du service d'auth | `http://localhost:8000` |
| `DEBUG` | Mode debug | `false` |
| `UPLOAD_MAX_SIZE` | Taille max des uploads (bytes) | `10485760` |
| `UPLOAD_ALLOWED_EXTENSIONS` | Extensions autorisées | `jpg,jpeg,png,gif,webp` |

## Sécurité

- Authentification basée sur les cookies de session voight-kampff
- Validation stricte des uploads d'images
- Permissions granulaires pour le partage
- Headers de sécurité configurés
- Mode production sans exposition de la documentation

## Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/ma-fonctionnalite`)
3. Commit les changements (`git commit -am 'Ajout de ma fonctionnalité'`)
4. Push la branche (`git push origin feature/ma-fonctionnalite`)
5. Créer une Pull Request

## Support

Pour toute question ou problème, créer une issue dans le repository.

## Licence

[Votre licence]