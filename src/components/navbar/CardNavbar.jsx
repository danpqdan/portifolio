import { Link } from 'react-router-dom';
import './CardNavbar.css';

export default function CardNavbar(){
  return (
    <nav className="card-navbar">
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/projects">Projetos</Link></li>
        <li><Link to="/about">Sobre</Link></li>
      </ul>
    </nav>
  )
}
