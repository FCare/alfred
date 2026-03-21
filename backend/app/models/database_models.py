"""
SQLAlchemy database models for Alfred
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime

from ..database import Base


class List(Base):
    """
    Shopping/Todo Lists table
    """
    __tablename__ = "lists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, nullable=False, index=True)  # Référence vers l'utilisateur VK
    owner_username = Column(String(255), nullable=False, index=True)
    is_private = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    archived_at = Column(DateTime, nullable=True)

    # Relationships
    items = relationship("ListItem", back_populates="list", cascade="all, delete-orphan")
    shares = relationship("ListShare", back_populates="list", cascade="all, delete-orphan")
    activities = relationship("ListActivity", back_populates="list", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<List(id={self.id}, name='{self.name}', owner='{self.owner_username}')>"


class ListItem(Base):
    """
    Items in a shopping list
    """
    __tablename__ = "list_items"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("lists.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    quantity = Column(String(100), nullable=True)  # Ex: "2 kg", "1 boîte", "3"
    description = Column(Text, nullable=True)
    image_path = Column(String(500), nullable=True)
    is_checked = Column(Boolean, default=False, nullable=False)
    position = Column(Integer, default=0, nullable=False)  # Pour l'ordre d'affichage
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    list = relationship("List", back_populates="items")

    def __repr__(self):
        return f"<ListItem(id={self.id}, name='{self.name}', list_id={self.list_id})>"


class ListShare(Base):
    """
    List sharing permissions
    """
    __tablename__ = "list_shares"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("lists.id"), nullable=False, index=True)
    shared_with_user_id = Column(Integer, nullable=True, index=True)  # NULL si partage par lien
    shared_with_username = Column(String(255), nullable=True, index=True)
    permission_level = Column(String(20), nullable=False)  # 'read', 'write', 'admin'
    shared_by_user_id = Column(Integer, nullable=False)
    shared_by_username = Column(String(255), nullable=False)
    invitation_token = Column(String(255), unique=True, nullable=True, index=True)  # Pour les invitations par lien
    expires_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    list = relationship("List", back_populates="shares")

    def __repr__(self):
        return f"<ListShare(id={self.id}, list_id={self.list_id}, user='{self.shared_with_username}', permission='{self.permission_level}')>"


class ListActivity(Base):
    """
    Activity history for lists
    """
    __tablename__ = "list_activity"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("lists.id"), nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    username = Column(String(255), nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)  # 'created', 'updated', 'deleted', 'shared', etc.
    details = Column(JSON, nullable=True)  # Détails de l'action
    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    list = relationship("List", back_populates="activities")

    def __repr__(self):
        return f"<ListActivity(id={self.id}, list_id={self.list_id}, action='{self.action}', user='{self.username}')>"